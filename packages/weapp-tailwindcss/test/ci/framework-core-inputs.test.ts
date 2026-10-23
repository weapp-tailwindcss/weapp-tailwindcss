import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { auditCoreFrameworkInputs } from '../../../../scripts/architecture/framework-boundaries/core-inputs'
import { createFrameworkBoundaryEdges, formatFrameworkBoundaryEdges } from '../../../../scripts/architecture/framework-boundaries/edges'
import { defaultFrameworkBoundaryRegistration } from '../../../../scripts/architecture/framework-boundaries/ownership'

const directories: string[] = []
afterEach(async () => {
  await Promise.all(directories.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

async function audit(files: Record<string, string>, dependencies: Record<string, string[]> = {}) {
  const root = await mkdtemp(path.join(tmpdir(), 'framework-core-inputs-'))
  directories.push(root)
  const source = path.join(root, 'packages', 'weapp-tailwindcss', 'src')
  const graph = new Map<string, Set<string>>()
  for (const [file, code] of Object.entries(files)) {
    const target = path.join(source, file)
    await mkdir(path.dirname(target), { recursive: true })
    await writeFile(target, code)
    graph.set(target, new Set((dependencies[file] ?? []).map(dependency => path.join(source, dependency))))
  }
  return auditCoreFrameworkInputs(root, graph)
}

describe('编译内部只消费已解析配置', () => {
  it.each(['UserDefinedOptions', 'InternalUserDefinedOptions', 'FrameworkPolicyInput', 'FrameworkEnvironment', 'AppType'])('禁止直接消费 %s', async (type) => {
    expect((await audit({ 'generation/request.ts': `import type { ${type} as Options } from '@/types'; export const use = (input: Options) => input` })).join('\n')).toContain('核心内部读取框架配置')
  })

  it('类型重导出、重命名和 Pick 包装不能隐藏原始配置', async () => {
    expect((await audit({
      'types/index.ts': 'export interface UserDefinedOptions { appType?: string }',
      'bridge.ts': "export type { UserDefinedOptions as Options } from './types'",
      'alias.ts': "import type { Options } from './bridge'; export type Configuration = Pick<Options, 'appType'>",
      'generation/request.ts': "import type { Configuration } from '../alias'; export const use = (input: Configuration) => input",
    })).join('\n')).toContain('核心内部读取框架配置')
  })

  it('namespace 和星号重导出仍受类型门禁约束', async () => {
    expect((await audit({
      'types/index.ts': 'export interface InternalUserDefinedOptions {}',
      'bridge.ts': "export type { InternalUserDefinedOptions as Options } from './types'",
      'alias.ts': "export type * from './bridge'",
      'compiler/request.ts': "import type * as Config from '../alias'; export type Request = { options: Config.Options }",
    })).join('\n')).toContain('核心内部读取框架配置')
  })

  it('内联 import 类型与本地别名不能绕过原始配置约束', async () => {
    expect((await audit({
      'types/index.ts': 'export interface InternalUserDefinedOptions {}',
      'bridge.ts': "export type { InternalUserDefinedOptions as Configuration } from './types'",
      'compiler/request.ts': "type Options = import('../bridge').Configuration; export interface Request { options: Options }",
    })).join('\n')).toContain('核心内部读取框架配置')
  })

  it.each([
    'export interface Request { appType: string }',
    "export const defaults = { appType: 'taro' }",
    'export const read = (options: Record<string, unknown>) => { const { uniAppX: extension } = options; return extension }',
    'export const read = (options: Record<string, unknown>) => options.uniAppX',
    "export const read = (options: Record<string, unknown>) => options['uniUtsPlatform']",
    "export const read = () => process.env['UNI_PLATFORM']",
    "export const read = () => process['env']['UNI_PLATFORM']",
  ])('禁止重新读取框架身份或进程环境：%s', async (code) => {
    expect((await audit({ 'generation/request.ts': code })).join('\n')).toContain('核心内部读取框架配置')
  })

  it('子模块扩展名不会隐藏重命名的原始类型', async () => {
    expect((await audit({
      'types/index.ts': 'export interface InternalUserDefinedOptions {}',
      'nested/index.cts': "export type { InternalUserDefinedOptions as Options } from '../types'",
      'compiler/request.ts': "import type { Options } from '../nested'; export interface Request { options: Options }",
    })).join('\n')).toContain('核心内部读取框架配置')
  })

  it('核心不得通过桥接模块重新调用兼容解析', async () => {
    expect((await audit({
      'generation/service.ts': "import '../bridge'",
      'bridge.ts': "export * from './context/generation'",
      'context/generation.ts': 'export const resolve = () => ({})',
    }, { 'generation/service.ts': ['bridge.ts'], 'bridge.ts': ['context/generation.ts'] })).join('\n')).toContain('核心内部引用兼容解析')
  })

  it('公开 compiler 重导出保留，但内部实现不能经公开 facade 回到兼容层', async () => {
    const files = {
      'core/compiler/index.ts': "export { createCompiler } from '../../context/compiler'; export type { CreateCompilerOptions } from '../../context/compiler-options'",
      'context/compiler.ts': 'export const createCompiler = () => ({})',
      'context/compiler-options.ts': 'export interface CreateCompilerOptions {}',
    }
    const dependencies = { 'core/compiler/index.ts': ['context/compiler.ts', 'context/compiler-options.ts'] }
    expect(await audit(files, dependencies)).toEqual([])
    expect((await audit({ ...files, 'compiler/owner.ts': "import '../core/compiler'" }, {
      ...dependencies, 'compiler/owner.ts': ['core/compiler/index.ts'],
    })).join('\n')).toContain('核心内部引用兼容解析')
  })

  it('公共兼容出口也不能增加未登记的内部解析依赖', async () => {
    expect((await audit({
      'core/compiler/index.ts': "import '../../context/generation'",
      'context/generation.ts': 'export const resolve = () => ({})',
    }, { 'core/compiler/index.ts': ['context/generation.ts'] })).join('\n')).toContain('核心内部引用兼容解析')
  })

  it('环境解析入口不能通过框架中立的包装名进入核心', async () => {
    expect((await audit({
      'compiler/request.ts': "import '../platform'",
      'platform.ts': "export { detectAppTypeFromEnv as detect } from '../../env/src/index'",
      '../../env/src/index.ts': 'export const detectAppTypeFromEnv = () => undefined',
    }, { 'compiler/request.ts': ['platform.ts'], 'platform.ts': ['../../env/src/index.ts'] })).join('\n')).toContain('核心内部引用兼容解析')
  })

  it('公开兼容例外具有具体边、理由和内部替代入口', () => {
    const root = path.resolve('fixture')
    const edges = formatFrameworkBoundaryEdges(root, createFrameworkBoundaryEdges(root, defaultFrameworkBoundaryRegistration))
    const allowed = edges.filter(edge => edge.entryOnly)
    expect(allowed).toHaveLength(3)
    for (const edge of allowed) {
      expect(edge).toMatchObject({ kind: 'compatibility', reason: expect.any(String), replacement: expect.stringContaining('禁止经过公开 facade') })
      expect(path.extname(edge.from)).toBe('.ts')
      expect(path.extname(edge.to)).toBe('.ts')
    }
  })


  it.each([
    "import type * as Config from './types'; export type Options = Config.UserDefinedOptions",
    "import type * as Config from './types'; export interface Options extends Config.UserDefinedOptions {}",
    "export * as Config from './types'",
    "export * as Outer from './nested'",
  ])('命名空间别名和命名空间聚合不能遮蔽原始类型：%s', async (bridge) => {
    const name = bridge.includes('export * as Outer') ? 'Outer.Config.UserDefinedOptions'
      : bridge.includes('export * as Config') ? 'Config.UserDefinedOptions' : 'Options'
    expect((await audit({
      'types/index.ts': 'export interface UserDefinedOptions {}',
      'nested.ts': "export * as Config from './types'",
      'bridge.ts': bridge,
      'generation/request.ts': `import type * as Public from '../bridge'; export type Request = { options: Public.${name} }`,
    })).join('\n')).toContain('核心内部读取框架配置')
  })

  it.each([
    "import type { Config } from '../bridge'; export interface Request { options: Config.UserDefinedOptions }",
    "import type { Public } from '../alias'; export interface Request { options: Public.UserDefinedOptions }",
    "export type Request = import('../bridge').Config.UserDefinedOptions",
  ])('命名空间通过命名导入和再次别名仍保持原始归属：%s', async (request) => {
    expect((await audit({
      'types/index.ts': 'export interface UserDefinedOptions {}',
      'bridge.ts': "export * as Config from './types'",
      'alias.ts': "export { Config as Public } from './bridge'",
      'generation/request.ts': request,
    })).join('\n')).toContain('核心内部读取框架配置')
  })

  it.each([
    "export type { UserDefinedOptions as Options } from '../types'",
    "export type { Options } from '../bridge'",
    "export type * from '../bridge'",
    "export * as Configuration from '../bridge'",
  ])('核心不能通过再导出携带原始配置：%s', async (request) => {
    expect((await audit({
      'types/index.ts': 'export interface UserDefinedOptions {}',
      'bridge.ts': "export type { UserDefinedOptions as Options } from './types'",
      'core/request.ts': request,
    })).join('\n')).toContain('核心内部读取框架配置')
  })

  it('兼容出口仅允许精确登记的类型依赖边', async () => {
    expect(await audit({
      'types/index.ts': 'export interface UserDefinedOptions {}',
      'context/compiler-options.ts': "import type { UserDefinedOptions } from '../types'; export interface CreateCompilerOptions extends UserDefinedOptions {}",
      'core/compiler/index.ts': "export type { CreateCompilerOptions } from '../../context/compiler-options'",
    })).toEqual([])
    expect((await audit({
      'types/index.ts': 'export interface UserDefinedOptions {}',
      'core/compiler/index.ts': "export type { UserDefinedOptions } from '../../types'",
    })).join('\n')).toContain('核心内部读取框架配置')
  })

  it('中立 profile 和请求允许独立演进', async () => {
    expect(await audit({
      'compiler/compilation-profile.ts': "export interface ResolvedCompilationProfile { readonly revision: number; readonly target: 'weapp' | 'web' }",
      'generation/request.ts': "import type { ResolvedCompilationProfile } from '../compiler/compilation-profile'; export interface Request { profile: ResolvedCompilationProfile; css: string }",
    }, { 'generation/request.ts': ['compiler/compilation-profile.ts'] })).toEqual([])
  })
})
