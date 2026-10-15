import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveBaseCwd, resolveOptions } from '../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/cli'

const toolRoot = fileURLToPath(new URL('../../../tools/weapp-tailwindcss-scripts/', import.meta.url))
const originalArgv = process.argv
const envKeys = [
  'E2E_WATCH_MINI_PROGRAM_SCOPE',
  'E2E_WATCH_MINI_PROGRAM_ONLY',
  'E2E_WATCH_MAIN_STYLE_SUBPACKAGE_LIMIT',
  'E2E_WATCH_MAX_HOT_UPDATE_MS',
  'E2E_WATCH_MAX_PLUGIN_PROCESS_MS',
  'E2E_WATCH_MAX_MEMORY_RSS_MB',
  'E2E_WATCH_MAX_MEMORY_RSS_DELTA_MB',
  'E2E_WATCH_MAX_MEMORY_HEAP_USED_MB',
] as const
const numericOptions = [
  ['--main-style-subpackage-limit', 'E2E_WATCH_MAIN_STYLE_SUBPACKAGE_LIMIT', 'mainStyleSubPackageLimit'],
  ['--max-hot-update-ms', 'E2E_WATCH_MAX_HOT_UPDATE_MS', 'maxHotUpdateMs'],
  ['--max-plugin-process-ms', 'E2E_WATCH_MAX_PLUGIN_PROCESS_MS', 'maxPluginProcessMs'],
  ['--max-memory-rss-mb', 'E2E_WATCH_MAX_MEMORY_RSS_MB', 'maxMemoryRssMb'],
  ['--max-memory-rss-delta-mb', 'E2E_WATCH_MAX_MEMORY_RSS_DELTA_MB', 'maxMemoryRssDeltaMb'],
  ['--max-memory-heap-used-mb', 'E2E_WATCH_MAX_MEMORY_HEAP_USED_MB', 'maxMemoryHeapUsedMb'],
] as const

beforeEach(() => {
  process.argv = ['node', 'watch-hmr-regression']
  for (const key of envKeys) {
    vi.stubEnv(key, undefined)
  }
})

afterEach(() => {
  process.argv = originalArgv
  vi.unstubAllEnvs()
})

describe('watch CLI 可选参数合同', () => {
  it('未提供的可选参数保持缺席，默认预算保持原值', () => {
    const options = resolveOptions()
    expect(options).toEqual({
      caseName: 'all',
      timeoutMs: 240000,
      pollMs: 40,
      skipBuild: false,
      quietSass: false,
      webOnly: false,
      miniProgramOnly: false,
      styleOnly: false,
      mainStyleOnly: false,
      maxPluginProcessMs: 500,
    })
    for (const key of ['miniProgramScope', 'mainStyleSubPackageLimit', 'reportFile', 'maxHotUpdateMs', 'maxMemoryRssMb', 'maxMemoryRssDeltaMb', 'maxMemoryHeapUsedMb'] as const) {
      expect(Object.hasOwn(options, key)).toBe(false)
      expect(options[key]).toBeUndefined()
    }
  })

  it('所有数值选项沿用环境默认值，显式零值优先且不被省略', () => {
    for (const [, env] of numericOptions) {
      vi.stubEnv(env, '123')
    }
    const fromEnv = resolveOptions()
    for (const [flag, , key] of numericOptions) {
      expect(fromEnv[key]).toBe(123)
      process.argv.push(flag, '0')
    }
    const explicit = resolveOptions()
    for (const [, , key] of numericOptions) {
      expect(Object.hasOwn(explicit, key)).toBe(true)
      expect(explicit[key]).toBe(0)
    }
  })

  it.each(['', ' ', 'invalid', 'Infinity'])('无效数值 %j 继续回退到环境值或既有默认值', (value) => {
    for (const [flag, env] of numericOptions) {
      process.argv.push(flag, value)
      vi.stubEnv(env, '321')
    }
    const fromEnv = resolveOptions()
    for (const [, env, key] of numericOptions) {
      expect(fromEnv[key]).toBe(321)
      vi.stubEnv(env, value)
    }
    const defaults = resolveOptions()
    expect(defaults.maxPluginProcessMs).toBe(500)
    for (const [, , key] of numericOptions) {
      if (key !== 'maxPluginProcessMs') {
        expect(Object.hasOwn(defaults, key)).toBe(false)
        expect(defaults[key]).toBeUndefined()
      }
    }
  })

  it.each(['main-package', 'subpackages'] as const)('环境 scope %s 仍开启小程序模式，CLI scope 优先', (scope) => {
    vi.stubEnv('E2E_WATCH_MINI_PROGRAM_SCOPE', scope)
    expect(resolveOptions()).toMatchObject({ miniProgramScope: scope, miniProgramOnly: true })
    process.argv.push('--mini-program-scope', 'subpackages')
    expect(resolveOptions()).toMatchObject({ miniProgramScope: 'subpackages', miniProgramOnly: true })
  })

  it('无效 scope 继续拒绝，独立小程序开关仍可读取', () => {
    vi.stubEnv('E2E_WATCH_MINI_PROGRAM_ONLY', 'true')
    expect(resolveOptions().miniProgramOnly).toBe(true)
    vi.stubEnv('E2E_WATCH_MINI_PROGRAM_SCOPE', 'unknown')
    expect(() => resolveOptions()).toThrow('invalid mini-program scope: unknown')
  })

  it('显式空报告路径保持存在，report 优先于 report-file 别名', () => {
    process.argv.push('--report-file', 'alias.json', '--report', '')
    const options = resolveOptions()
    expect(Object.hasOwn(options, 'reportFile')).toBe(true)
    expect(options.reportFile).toBe('')
  })

  it('INIT_CWD 继续从调用者目录定位 workspace 根', () => {
    vi.stubEnv('INIT_CWD', path.join(toolRoot, 'src', 'watch-hmr-regression'))
    expect(resolveBaseCwd()).toBe(path.resolve(toolRoot, '..', '..'))
  })

  it('真实工具 tsconfig 的严格选项下 CLI 无类型诊断', () => {
    const configFile = ts.readConfigFile(path.join(toolRoot, 'tsconfig.json'), ts.sys.readFile)
    expect(configFile.error).toBeUndefined()
    const config = ts.parseJsonConfigFileContent(configFile.config, ts.sys, toolRoot)
    // 使用仓库真实编译选项，只收窄入口，不替换或放宽严格约束。
    const program = ts.createProgram([path.join(toolRoot, 'src', 'watch-hmr-regression', 'cli.ts')], config.options)
    const diagnostics = [...config.errors, ...ts.getPreEmitDiagnostics(program)]
    expect(ts.formatDiagnostics(diagnostics, {
      getCanonicalFileName: file => file,
      getCurrentDirectory: ts.sys.getCurrentDirectory,
      getNewLine: () => ts.sys.newLine,
    })).toBe('')
  })
})
