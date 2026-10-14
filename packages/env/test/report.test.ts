import type { DetectAppTypeOptions, FrameworkEnv } from '../src'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { detectAppType, detectAppTypeReport } from '../src'

const roots: string[] = []
afterEach(async () => {
  vi.unstubAllEnvs()
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

async function fixture(pkg: unknown = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'env-report-'))
  roots.push(root)
  await writeFile(path.join(root, 'package.json'), JSON.stringify(pkg))
  return root
}

describe('首次命中阶段的检测报告', () => {
  it('聚合同框架证据，保持框架优先级并列出其他家族', () => {
    const report = detectAppTypeReport({
      packageJson: {
        dependencies: { 'weapp-vite': '*', '@mpxjs/core': '*', '@tarojs/runtime': '^4' },
        peerDependencies: { '@tarojs/service': '*' },
        scripts: { build: 'pnpm exec taro build' },
      },
      env: { UNI_PLATFORM: 'h5' },
    })
    expect(report.appType).toBe('weapp-vite')
    expect(report.candidates.map(candidate => candidate.appType)).toEqual(['weapp-vite', 'mpx', 'taro'])
    expect(report.conflicts).toEqual(['mpx', 'taro'])
    expect(report.candidates[2]?.evidence).toEqual([
      { source: 'dependency', key: 'dependencies.@tarojs/runtime', value: '^4' },
      { source: 'dependency', key: 'peerDependencies.@tarojs/service', value: '*' },
      { source: 'script', key: 'scripts.build', value: 'pnpm exec taro build' },
    ])
  })

  it('显式 manifest 命中后不读取低优先级对象或环境', () => {
    const options: DetectAppTypeOptions = { manifest: { 'uni-app-x': {} } }
    for (const key of ['packageJson', 'root', 'env']) {
      Object.defineProperty(options, key, {
        get() {
          throw new Error('越过阶段边界')
        },
      })
    }
    expect(detectAppTypeReport(options)).toEqual({
      appType: 'uni-app-x',
      candidates: [{ appType: 'uni-app-x', evidence: [{ source: 'manifest', key: 'uni-app-x' }] }],
      conflicts: [],
    })
    expect(detectAppType(options)).toBe('uni-app-x')
  })

  it('uni-app 变体是细化候选，不互相报告冲突', () => {
    const report = detectAppTypeReport({ packageJson: {
      'dependencies': { '@dcloudio/uni-app': '*', '@dcloudio/uni-uts-v1': '*' },
      'scripts': { build: 'uni build' },
      'uni-app': {},
    } })
    expect(report.appType).toBe('uni-app-x')
    expect(report.candidates.map(candidate => candidate.appType)).toEqual(['uni-app-x', 'uni-app-vite', 'uni-app'])
    expect(report.conflicts).toEqual([])
    expect(report.candidates[2]?.evidence).toContainEqual({ source: 'package-field', key: 'uni-app' })
  })

  it('实际文件证据使用绝对路径，最近命中后不继续上溯或读取环境', async () => {
    const root = await fixture({ dependencies: { 'weapp-vite': '*' } })
    const nested = path.join(root, 'nested')
    await mkdir(nested)
    await writeFile(path.join(nested, 'package.json'), JSON.stringify({ dependencies: { '@tarojs/runtime': '*' } }))
    const options: DetectAppTypeOptions = { root: path.relative(process.cwd(), nested) }
    Object.defineProperty(options, 'env', {
      get() {
        throw new Error('不应读取环境')
      },
    })
    const report = detectAppTypeReport(options)
    expect(report.appType).toBe('taro')
    expect(report.candidates).toEqual([{ appType: 'taro', evidence: [{
      source: 'dependency',
      key: 'dependencies.@tarojs/runtime',
      value: '*',
      path: path.join(nested, 'package.json'),
    }] }])
    expect(report.conflicts).toEqual([])
  })

  it('初始目录 marker 聚合，但不读取同目录 manifest/package', async () => {
    const root = await fixture({ dependencies: { 'weapp-vite': '*' } })
    await mkdir(path.join(root, 'src'))
    for (const file of [path.join(root, 'src', 'app.mpx'), path.join(root, 'app.mpx')]) {
      await writeFile(file, '')
    }
    await writeFile(path.join(root, 'manifest.json'), JSON.stringify({ 'uni-app-x': {} }))
    const report = detectAppTypeReport({ root })
    expect(report.appType).toBe('mpx')
    expect(report.candidates[0]?.evidence).toEqual([
      { source: 'marker', key: 'app.mpx', path: path.join(root, 'src', 'app.mpx') },
      { source: 'marker', key: 'app.mpx', path: path.join(root, 'app.mpx') },
    ])
  })

  it('同层 manifest 优先于 package，配置路径不虚构', async () => {
    const root = await fixture({ dependencies: { 'weapp-vite': '*' } })
    await writeFile(path.join(root, 'manifest.json'), '{ /* uni-app x */ "uni-app-x": {} } // manifest')
    const report = detectAppTypeReport({ root })
    expect(report.appType).toBe('uni-app-x')
    expect(report.appType).toBe(detectAppType({ root }))
    expect(report.candidates).toEqual([{ appType: 'uni-app-x', evidence: [{
      source: 'manifest',
      key: 'uni-app-x',
      path: path.join(root, 'manifest.json'),
    }] }])
  })

  it('损坏的注释 manifest 和带注释的 package 仍按既有阶段回退', async () => {
    const root = await fixture()
    await writeFile(path.join(root, 'manifest.json'), '{ "uni-app-x": {}, "enabled": tr/* comment */ue }')
    const packageFile = path.join(root, 'package.json')
    await writeFile(packageFile, '{ /* comment */ "dependencies": { "@tarojs/runtime": "*" } }')
    const options = { root, searchUp: false, env: {} }
    expect(detectAppTypeReport(options)).toEqual({ appType: undefined, candidates: [], conflicts: [] })
    expect(detectAppType(options)).toBeUndefined()
    await writeFile(packageFile, '{ "dependencies": { "@tarojs/runtime": "*" } }')
    const report = detectAppTypeReport(options)
    expect(report.appType).toBe(detectAppType(options))
    expect(report.candidates).toEqual([{ appType: 'taro', evidence: [{ source: 'dependency', key: 'dependencies.@tarojs/runtime', value: '*', path: packageFile }] }])
    expect(report.conflicts).toEqual([])
  })

  it('损坏 JSON、父目录 marker、searchUp 与不存在目录保持既有规则', async () => {
    const root = await fixture({ dependencies: { '@tarojs/runtime': '*' } })
    const nested = path.join(root, 'nested')
    await mkdir(nested)
    await writeFile(path.join(root, 'app.mpx'), '')
    await writeFile(path.join(nested, 'package.json'), '{broken')
    await writeFile(path.join(nested, 'manifest.json'), '{broken')
    expect(detectAppTypeReport({ root: nested }).appType).toBe('taro')
    expect(detectAppTypeReport({ root: nested, searchUp: false })).toEqual({ appType: undefined, candidates: [], conflicts: [] })
    expect(detectAppTypeReport({ root: path.join(root, 'missing'), env: { TARO_ENV: 'h5' } }).appType).toBe('taro')
  })

  it('环境阶段聚合多个信号，保留优先级与家族冲突', () => {
    const report = detectAppTypeReport({ env: {
      WEAPP_TW_TARGET: 'weapp-vite',
      WEAPP_TAILWINDCSS_TARGET: 'weapp-vite',
      TARO_ENV: 'weapp',
      MPX_CLI_MODE: 'wx',
      MPX_CURRENT_TARGET_MODE: 'ali',
      UNI_PLATFORM: 'h5',
      UNI_UTS_PLATFORM: 'app-ios',
    }, cwd: os.tmpdir() })
    expect(report.candidates.map(candidate => candidate.appType)).toEqual(['weapp-vite', 'taro', 'mpx', 'uni-app-x', 'uni-app-vite'])
    expect(report.conflicts).toEqual(['taro', 'mpx', 'uni-app-x', 'uni-app-vite'])
    expect(report.candidates[0]?.evidence.map(item => item.key)).toEqual(['WEAPP_TW_TARGET', 'WEAPP_TAILWINDCSS_TARGET'])
    expect(report.candidates[2]?.evidence.map(item => item.key)).toEqual(['MPX_CLI_MODE', 'MPX_CURRENT_TARGET_MODE'])
  })

  it.each([
    '/Applications/HBuilderX.app/Contents/HBuilderX/plugins/uniapp-cli-vite',
    String.raw`C:\tools\HBuilderX\plugins\uniapp-cli-vite`,
    String.raw`\\server\tools\HBuilderX\plugins\uniapp-cli-vite`,
  ])('聚合环境和 HBuilderX 的同框架证据：%s', (cwd) => {
    const report = detectAppTypeReport({ env: { UNI_PLATFORM: 'h5' }, cwd })
    expect(report.candidates).toEqual([{ appType: 'uni-app-vite', evidence: [
      { source: 'env', key: 'UNI_PLATFORM', value: 'h5' },
      { source: 'hbuilderx', key: 'cwd', value: cwd },
    ] }])
    expect(report.conflicts).toEqual([])
    expect(detectAppTypeReport({ env: {}, cwd, hbuilderxVite: false }).appType).toBe('uni-app')
  })

  it('显式快照缺失字段不继承进程，默认按调用时读取环境', () => {
    vi.stubEnv('UNI_PLATFORM', 'h5')
    vi.stubEnv('UNI_UTS_PLATFORM', 'app-ios')
    const options = { cwd: os.tmpdir() }
    expect(detectAppTypeReport({ ...options, env: {}, detectEnv: true }).appType).toBeUndefined()
    expect(detectAppTypeReport(options).appType).toBeUndefined()
    expect(detectAppTypeReport({ ...options, detectEnv: true }).appType).toBe('uni-app-x')
    vi.stubEnv('UNI_UTS_PLATFORM', undefined)
    expect(detectAppTypeReport({ ...options, detectEnv: true }).appType).toBe('uni-app-vite')
    const env: FrameworkEnv = { TARO_ENV: 'weapp' }
    Object.defineProperty(env, 'UNI_PLATFORM', {
      get() {
        throw new Error('普通检测应短路')
      },
    })
    expect(detectAppType({ env })).toBe('taro')
  })

  it.each([
    ['WEAPP_TW_TARGET', 'WEAPP_TAILWINDCSS_TARGET', 'weapp-vite'],
    ['MPX_CLI_MODE', 'MPX_CURRENT_TARGET_MODE', 'mpx'],
  ])('普通检测在首个有效别名后短路：%s', (first, second, appType) => {
    const env: FrameworkEnv = { [first!]: appType === 'mpx' ? 'wx' : 'weapp-vite' }
    Object.defineProperty(env, second!, {
      get() {
        throw new Error('不应读取后续别名')
      },
    })
    expect(detectAppType({ env })).toBe(appType)
  })

  it('证据复用已匹配的值，不为取证再次读取 UNI_PLATFORM', () => {
    const read = vi.fn(() => ' H5 ')
    const env: FrameworkEnv = {}
    Object.defineProperty(env, 'UNI_PLATFORM', { get: read })
    expect(detectAppTypeReport({ env, cwd: os.tmpdir() }).candidates[0]?.evidence).toEqual([
      { source: 'env', key: 'UNI_PLATFORM', value: ' H5 ' },
    ])
    expect(read).toHaveBeenCalledTimes(1)
  })

  it.each<DetectAppTypeOptions>([
    {},
    { manifest: { 'uni-app-x': {} } },
    { packageJson: { dependencies: { '@mpxjs/core': '*', '@tarojs/runtime': '*' } } },
    { packageJson: { scripts: { build: 'cross-env UNI_PLATFORM=h5 uni build' } } },
    { env: { TARO_ENV: 'h5', UNI_PLATFORM: 'mp-weixin' }, cwd: os.tmpdir() },
    { env: {}, cwd: os.tmpdir() },
  ])('普通检测与报告的结果一致：%j', (options) => {
    expect(detectAppTypeReport(options).appType).toBe(detectAppType(options))
  })
})
