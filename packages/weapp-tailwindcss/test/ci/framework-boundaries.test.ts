import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { auditArchitecture } from '../../../../scripts/architecture/audit'
import { frameworkOwner } from '../../../../scripts/architecture/framework-boundaries'
import { createFrameworkBoundaryRegistration, defaultFrameworkBoundaryRegistration } from '../../../../scripts/architecture/framework-boundaries/ownership'

const directories: string[] = []
afterEach(async () => {
  await Promise.all(directories.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

async function auditFixture(files: Record<string, string>, injectorFiles: Record<string, string> = {}, frameworks = defaultFrameworkBoundaryRegistration) {
  const root = await mkdtemp(path.join(tmpdir(), 'framework-boundaries-'))
  directories.push(root)
  const packageRoot = path.join(root, 'packages', 'weapp-tailwindcss')
  await mkdir(packageRoot, { recursive: true })
  await writeFile(path.join(packageRoot, 'package.json'), JSON.stringify({ name: 'weapp-tailwindcss', exports: { '.': './dist/index.js' } }))
  await writeFile(path.join(packageRoot, 'tsconfig.json'), JSON.stringify({
    compilerOptions: { moduleResolution: 'bundler', paths: { '@/*': ['./src/*'] } },
  }))
  for (const [file, content] of Object.entries(files)) {
    const target = path.join(packageRoot, 'src', file)
    await mkdir(path.dirname(target), { recursive: true })
    await writeFile(target, content)
  }
  if (Object.keys(injectorFiles).length > 0) {
    const injectorRoot = path.join(root, 'packages', 'weapp-style-injector')
    await mkdir(injectorRoot, { recursive: true })
    await writeFile(path.join(injectorRoot, 'package.json'), JSON.stringify({
      name: 'weapp-style-injector',
      exports: { './vite/taro': './dist/vite/taro.js', './webpack/mpx': './dist/webpack/mpx.js', './vite/uni-app': './dist/vite/uni-app.js' },
    }))
    for (const [file, content] of Object.entries(injectorFiles)) {
      const target = path.join(injectorRoot, 'src', file)
      await mkdir(path.dirname(target), { recursive: true })
      await writeFile(target, content)
    }
  }
  return auditArchitecture(root, { frameworks }).errors
}

describe('框架实现依赖边界', () => {
  it.each([
    "export const select = (appType: string) => appType === 'taro'",
    "export const select = (framework: string) => 'generic' !== framework",
    "export function select(appType: string) { switch (appType) { case 'mpx': return true } }",
    "export const select = (appType: string) => ['uni-app', 'uni-app-x'].includes(appType)",
  ])('共享实现不能内联框架选择：%s', async (source) => {
    expect((await auditFixture({ 'bundlers/vite/shared/service.ts': source })).join('\n')).toContain('共享实现选择框架')
  })

  it('允许组装入口与框架策略选择，不把类型和配置数据当作分派', async () => {
    expect(await auditFixture({
      'bundlers/vite/index.ts': "export const select = (appType: string) => appType === 'taro'",
      'framework-policies/environment.ts': "export const select = (appType: string) => appType === 'uni-app-vite'",
      'bundlers/vite/frameworks/taro/index.ts': "export const select = (appType: string) => appType === 'taro'",
      'compiler/types.ts': "export type Framework = 'generic' | 'taro'; export const defaults = { appType: 'taro' }",
      'compiler/backend.ts': "export const native = (backend: string) => backend === 'native'",
    })).toEqual([])
  })

  it.each([
    { paths: path.posix, source: '/repo/src' },
    { paths: path.win32, source: 'C:\\repo\\src' },
    { paths: path.win32, source: '\\\\server\\share\\src' },
  ])('按文件系统路径识别目录归属：$source', ({ paths, source }) => {
    expect(frameworkOwner(source, paths.join(source, 'bundlers', 'vite', 'frameworks', 'taro', 'index.ts'), paths)).toBe('taro')
    expect(frameworkOwner(source, paths.join(source, '..', 'other', 'uni-app-x', 'asset.ts'), paths)).toBeUndefined()
    expect(frameworkOwner(source, paths.join(source, 'framework-policies', 'uni-app-x.ts'), paths)).toBe('uni-app-x')
    expect(frameworkOwner(source, paths.join(source, 'style-injector', 'vite', 'uni.ts'), paths)).toBe('uni')
  })

  it('不同盘符与相对目录不能被误判为框架实现', () => {
    expect(frameworkOwner('C:\\repo\\src', 'D:\\repo\\src\\uni-app-x\\asset.ts', path.win32)).toBeUndefined()
    expect(frameworkOwner('src', path.join('src', 'uni-app-x', 'asset.ts'))).toBe('uni-app-x')
  })

  it.each([
    "import '@/uni-app-x/asset'",
    "import type { Options } from '@/uni-app-x/asset'",
    "export * from '@/uni-app-x/asset'",
    "export type { Options } from '@/uni-app-x/asset'",
    "const load = () => import('@/uni-app-x/asset')",
  ])('共享深层模块不能引用框架实现：%s', async (source) => {
    const errors = await auditFixture({
      'bundlers/vite/generate-bundle/finalize/entry.ts': source,
      'uni-app-x/asset.ts': 'export interface Options {}',
    })
    expect(errors.join('\n')).toContain('共享实现引用框架')
  })

  it('追踪共享 facade 与类型重导出的完整路径', async () => {
    const errors = await auditFixture({
      'bundlers/webpack/loaders/entry.ts': "import type { Options } from '@/bridge'",
      'bridge.ts': "export type { Options } from '@/bundlers/webpack/frameworks/mpx/loader'",
      'bundlers/webpack/frameworks/mpx/loader.ts': 'export interface Options {}',
    })
    expect(errors.join('\n')).toContain('共享实现引用框架')
    expect(errors.join('\n')).toContain('bridge.ts ->')
  })

  it('核心不得直接引用具体框架策略', async () => {
    const errors = await auditFixture({
      'generation/pipeline/entry.ts': "import '@/framework-policies/uni-app-x'",
      'framework-policies/uni-app-x.ts': 'export const enabled = true',
    })
    expect(errors.join('\n')).toContain('共享实现引用框架')
  })

  it('框架不得经共享 facade 引用另一个框架', async () => {
    const errors = await auditFixture({
      'bundlers/vite/frameworks/taro/index.ts': "import '@/bridge'",
      'bridge.ts': "export * from '@/uni-app-x/asset'",
      'uni-app-x/asset.ts': 'export const value = 1',
    })
    expect(errors.join('\n')).toContain('框架横向依赖')
  })

  it('允许同一框架组合自身模块与中立服务', async () => {
    expect(await auditFixture({
      'bundlers/vite/frameworks/uni-app-x/index.ts': "import '@/uni-app-x/asset'; import '@/bundlers/vite/shared/service'",
      'uni-app-x/asset.ts': "import type { Options } from '@/compiler/framework-policy'",
      'compiler/framework-policy.ts': 'export interface Options {}',
      'bundlers/vite/shared/service.ts': 'export const value = 1',
    })).toEqual([])
  })

  it('允许公开分派入口选择框架，但共享模块不能经该入口绕过边界', async () => {
    const files = {
      'bundlers/vite/index.ts': "export * from './frameworks/taro'",
      'bundlers/vite/frameworks/taro/index.ts': 'export const value = 1',
    }
    expect(await auditFixture(files)).toEqual([])
    expect((await auditFixture({
      ...files,
      'bundlers/vite/shared/service.ts': "import '..'",
    })).join('\n')).toContain('共享实现引用框架')
  })

  it('兼容入口解析策略，生成核心只消费中立契约', async () => {
    expect(await auditFixture({
      'context/index.ts': "import '@/framework-policies/resolve'",
      'framework-policies/resolve.ts': "import './taro'",
      'framework-policies/taro.ts': "import type { Policy } from '@/compiler/framework-policy'",
      'compiler/framework-policy.ts': 'export interface Policy {}',
      'generation/service.ts': "import '@/context'; import type { Policy } from '@/compiler/framework-policy'",
    })).toEqual([])
  })

  it('共享核心不能直接使用兼容解析器选择框架', async () => {
    expect((await auditFixture({
      'generation/service.ts': "import '@/bridge'",
      'bridge.ts': "export * from '@/framework-policies/resolve'",
      'framework-policies/resolve.ts': "export const resolve = () => ({})",
    })).join('\n')).toContain('框架策略解析入口越界')
  })

  it('共享 injector 生命周期不能依赖聚合的框架工厂', async () => {
    expect((await auditFixture({
      'style-injector/vite/runtime.ts': "import '../internal'",
      'style-injector/internal.ts': "export * from './vite/taro'",
      'style-injector/vite/taro.ts': 'export const value = 1',
    })).join('\n')).toContain('共享实现引用框架')
  })

  it('共享实现不能通过 workspace 子路径直接加载框架 injector', async () => {
    expect((await auditFixture({
      'style-injector/vite/runtime.ts': "import 'weapp-style-injector/vite/taro'",
    }, { 'vite/taro.ts': 'export const value = 1' })).join('\n')).toContain('共享实现引用框架')
  })

  it('跨包类型重导出也不能跨框架引用 injector', async () => {
    expect((await auditFixture({
      'bundlers/vite/frameworks/taro/index.ts': "import type { Options } from '@/bridge'",
      'bridge.ts': "export type { Options } from 'weapp-style-injector/webpack/mpx'",
    }, { 'webpack/mpx.ts': 'export interface Options {}' })).join('\n')).toContain('框架横向依赖')
  })

  it('uni 家族可复用协议，但其他框架与共享流程不能消费它', async () => {
    const shared = {
      'style-injector/vite/uni.ts': "export * from 'weapp-style-injector/vite/uni-app'",
    }
    const injector = { 'vite/uni-app.ts': 'export const value = 1' }
    expect(await auditFixture({
      ...shared,
      'bundlers/vite/frameworks/uni-app-x/index.ts': "import '@/style-injector/vite/uni'",
      'bundlers/vite/frameworks/uni-app/index.ts': "import '@/style-injector/vite/uni'",
    }, injector)).toEqual([])
    expect((await auditFixture({
      ...shared,
      'bundlers/vite/frameworks/taro/index.ts': "import '@/style-injector/vite/uni'",
      'bundlers/vite/shared/service.ts': "import '@/style-injector/vite/uni'",
    }, injector)).join('\n')).toMatch(/框架横向依赖[\s\S]*共享实现引用框架/)
  })

  it('preset 的共享 helper 也不能绕过框架边界', async () => {
    expect((await auditFixture({
      'presets/shared.ts': "import '@/uni-app-x/options'",
      'uni-app-x/options.ts': 'export const value = 1',
    })).join('\n')).toContain('共享实现引用框架')
  })

  it('preset 不能经聚合导出依赖其它框架', async () => {
    expect((await auditFixture({
      'presets/taro.ts': "import './index'",
      'presets/index.ts': "export * from './uni-app-x'",
      'presets/uni-app-x.ts': 'export const value = 1',
    })).join('\n')).toContain('框架横向依赖')
  })

  it('框架策略不允许依赖构建器类型', async () => {
    expect((await auditFixture({
      'framework-policies/taro.ts': "import type { Plugin } from 'vite'",
    })).join('\n')).toContain('核心反向依赖')
  })

  it.each([
    'bundlers/vite/frameworks/new-framework/index.ts',
    'bundlers/vite/frameworks/shared/unknown/protocol.ts',
    'framework-policies/new-framework.ts',
    'style-injector/vite/new-framework/index.ts',
  ])('新框架模块必须有明确归属：%s', async (file) => {
    expect((await auditFixture({ [file]: 'export const value = true' })).join('\n')).toContain('框架模块缺少归属')
  })

  it('injector 根实现和深层模块不能横向引用', async () => {
    expect((await auditFixture({}, {
      'mpx.ts': "export type { Options } from './taro/internal/types'",
      'taro/internal/types.ts': 'export interface Options {}',
    })).join('\n')).toContain('框架横向依赖')
  })

  it('injector 共享模块不能通过聚合导出访问根框架实现', async () => {
    expect((await auditFixture({}, {
      'core.ts': "import './index'",
      'index.ts': "export * from './taro'",
      'taro.ts': 'export const value = true',
    })).join('\n')).toContain('共享实现引用框架')
  })

  it('未登记的 injector 目录不能默认为共享模块', async () => {
    expect((await auditFixture({}, { 'new-framework/asset.ts': 'export const value = true' })).join('\n')).toContain('框架模块缺少归属')
  })

  it('同一文件的冲突归属不能通过较宽松规则放行', async () => {
    const registration = createFrameworkBoundaryRegistration(undefined, undefined, [{
      package: 'weapp-tailwindcss', path: ['bundlers', 'vite', 'frameworks', 'taro', 'index.ts'], owner: 'mpx',
    }])
    expect((await auditFixture({ 'bundlers/vite/frameworks/taro/index.ts': 'export const value = true' }, {}, registration)).join('\n')).toContain('框架模块归属冲突')
  })

  it('注册数据本身不能包含冲突别名或未登记框架', async () => {
    const registration = createFrameworkBoundaryRegistration({
      ...defaultFrameworkBoundaryRegistration.frameworks,
      fixture: { aliases: ['uni-app-vite'] },
    }, { ...defaultFrameworkBoundaryRegistration.bundlers, vite: ['unknown'] }, [{
      package: 'weapp-style-injector', path: ['unknown', 'index.ts'], owner: 'unknown',
    }])
    const errors = (await auditFixture({}, {}, registration)).join('\n')
    expect(errors).toContain('框架别名归属冲突')
    expect(errors).toContain('构建器支持组合缺少框架登记')
    expect(errors).toContain('模块所有者缺少框架登记')
  })

  it('新增框架只增加注册数据即可使用现有中立能力', async () => {
    const registration = createFrameworkBoundaryRegistration({
      ...defaultFrameworkBoundaryRegistration.frameworks,
      fixture: { aliases: ['fixture-alias'] },
    }, { ...defaultFrameworkBoundaryRegistration.bundlers, vite: [...defaultFrameworkBoundaryRegistration.bundlers.vite!, 'fixture'] })
    expect(await auditFixture({
      'bundlers/vite/index.ts': "export * from './frameworks/fixture'",
      'bundlers/vite/frameworks/fixture/index.ts': "import type { Policy } from '@/compiler/framework-policy'; export const profile: Policy = { web: true }",
      'framework-policies/fixture.ts': "import type { Policy } from '@/compiler/framework-policy'; export const profile: Policy = { web: true }",
      'compiler/framework-policy.ts': 'export interface Policy { web: boolean }',
    }, {}, registration)).toEqual([])
  })

  it('组装入口不允许直接依赖未登记的框架内部模块', async () => {
    expect((await auditFixture({
      'bundlers/vite/index.ts': "export * from './frameworks/taro/private'",
      'bundlers/vite/frameworks/taro/private.ts': 'export const value = true',
    })).join('\n')).toContain('共享实现引用框架')
  })
})
