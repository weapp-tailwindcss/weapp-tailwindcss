import type { CliOptions, WatchCase, WatchSession } from '../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/types'
import { Buffer } from 'node:buffer'
import { promises as fs } from 'node:fs'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runCase, runMainStyleOnlyCase, runSubPackagesOnlyCase, runWebOnlyCase, WatchHmrPartialMetricsError } from '../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/runner'

const mocks = vi.hoisted(() => ({
  mutate: vi.fn(),
  session: vi.fn(),
  monitor: vi.fn(),
  write: vi.fn(),
}))

vi.mock('../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/session', () => ({
  createWatchSession: () => mocks.session(),
  runPnpmCommand: vi.fn(),
  sleep: vi.fn(),
}))
vi.mock('../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/mutations', () => ({
  createSubPackageWatchCase: (watchCase: WatchCase) => watchCase,
  runClassMutation: (...args: unknown[]) => mocks.mutate(...args),
  runMainStyleHotUpdate: (...args: unknown[]) => mocks.mutate(...args),
  runStyleMutation: vi.fn(),
  runSubPackageMutation: (...args: unknown[]) => mocks.mutate(...args),
  waitForInitialWarmup: vi.fn(async () => 0),
  waitForOutputsReady: vi.fn(async () => 0),
}))
vi.mock('../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/web', () => ({
  runWebHmr: (...args: unknown[]) => mocks.mutate(...args),
}))
vi.mock('../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/output-integrity', () => ({
  createOutputIntegrityMonitor: () => mocks.monitor(),
}))
vi.mock('../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/text', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/text')>()
  return {
    ...actual,
    writeFilePreserveEol: async (...args: Parameters<typeof actual.writeFilePreserveEol>) => {
      mocks.write(...args)
      return actual.writeFilePreserveEol(...args)
    },
  }
})

function errorTree(error: unknown): unknown[] {
  if (!(error instanceof Error)) {
    return [error]
  }
  return [error, ...('errors' in error && Array.isArray(error.errors) ? error.errors.flatMap(errorTree) : []), ...('cause' in error ? errorTree(error.cause) : [])]
}

const options: CliOptions = {
  caseName: 'all',
  timeoutMs: 1000,
  pollMs: 10,
  skipBuild: true,
  quietSass: true,
  webOnly: false,
  miniProgramOnly: false,
  styleOnly: false,
  mainStyleOnly: false,
}

describe('watch runner 收尾失败保留与资源释放', () => {
  let directory: string
  let watchCase: WatchCase
  let template: string
  let script: string
  let style: string
  let session: WatchSession
  let monitor: { assertClean: ReturnType<typeof vi.fn>, stop: ReturnType<typeof vi.fn> }

  beforeEach(async () => {
    vi.resetAllMocks()
    directory = await mkdtemp(path.join(os.tmpdir(), 'watch-cleanup-'))
    template = path.join(directory, 'template.vue')
    script = path.join(directory, 'script.ts')
    style = path.join(directory, 'style.css')
    await Promise.all([template, script, style].map(file => writeFile(file, 'original\r\n')))
    session = {
      child: {} as WatchSession['child'],
      ensureRunning: vi.fn(),
      lastCompileSuccessAt: () => 0,
      logs: () => 'owned session logs',
      memorySamplesSince: () => [],
      memoryDebugSamplesSince: () => [],
      pluginProcessSamplesSince: () => [],
      stop: vi.fn(async () => {}),
    }
    monitor = { assertClean: vi.fn(), stop: vi.fn() }
    mocks.session.mockReturnValue(session)
    mocks.monitor.mockReturnValue(monitor)
    const templateMutation: WatchCase['templateMutation'] = { sourceFile: template, verifyEscapedIn: ['js'], mutate: source => source }
    const styleMutation: WatchCase['styleMutation'] = { sourceFile: style, mutate: source => source }
    watchCase = {
      name: 'weapp-vite-tailwindcss-v4',
      label: 'cleanup fixture',
      project: 'cleanup-fixture',
      group: 'demo',
      cwd: directory,
      devScript: 'unused',
      outputWxml: path.join(directory, 'out.wxml'),
      outputJs: path.join(directory, 'out.js'),
      outputStyleCandidates: [],
      globalStyleCandidates: [],
      templateMutation,
      scriptMutation: { ...templateMutation, sourceFile: script },
      styleMutation,
      subPackageMutations: [{
        root: 'sub-independent',
        independent: true,
        outputWxml: path.join(directory, 'feature.wxml'),
        outputJs: path.join(directory, 'feature.js'),
        outputStyleCandidates: [],
        globalStyleCandidates: [],
        templateMutation,
        styleMutation,
      }],
      webHmr: { sourceFile: template, cssEntryFile: script } as NonNullable<WatchCase['webHmr']>,
    }
  })

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  it.each([
    ['完整 watch', runCase],
    ['分包', runSubPackagesOnlyCase],
    ['Web', runWebOnlyCase],
    ['主样式', runMainStyleOnlyCase],
  ] as const)('%s 保留主失败与源码恢复失败并继续停止已领取资源', async (name, run) => {
    const primary = new Error('mutation failed first')
    const readError = Object.assign(new Error('restore read denied'), { code: 'EACCES' })
    const writeError = new Error('restore write denied')
    const monitorError = new Error('monitor stop rejected')
    const sessionError = new Error('session stop rejected')
    let denyRead = false
    const originalRead = fs.readFile
    vi.spyOn(fs, 'readFile').mockImplementation((...args) => {
      if (denyRead && args[0] === script) {
        return Promise.reject(readError)
      }
      return originalRead(...args)
    })
    mocks.mutate.mockImplementation(async () => {
      await writeFile(template, 'changed\n')
      await writeFile(script, 'changed\n')
      await writeFile(style, 'changed\n')
      denyRead = true
      throw primary
    })
    mocks.write.mockImplementation((file: string) => {
      if (file === template) {
        throw writeError
      }
    })
    monitor.stop.mockRejectedValue(monitorError)
    vi.mocked(session.stop).mockRejectedValue(sessionError)

    const error = await run(watchCase, options).catch(error => error)
    const errors = errorTree(error)
    expect(errors).toContain(primary)
    expect(errors).toContain(writeError)
    expect(error.stack).toContain('mutation failed first')
    expect(error.stack).toContain('restore write denied')
    expect(error.stack).toContain(template)
    if (name !== '主样式') {
      expect(error.stack).toContain(script)
      expect(errors).toContain(readError)
      expect(error.stack).toContain('restore read denied')
    }
    if (name === '完整 watch' || name === '分包') {
      expect(await readFile(style, 'utf8')).toBe('original\r\n')
    }
    if (name === '完整 watch') {
      expect(monitor.stop).toHaveBeenCalledOnce()
      expect(errors).toContain(monitorError)
      expect(error.stack).toContain('monitor stop rejected')
    }
    if (name !== 'Web') {
      expect(session.stop).toHaveBeenCalledOnce()
      expect(errors).toContain(sessionError)
      expect(error.stack).toContain('session stop rejected')
    }
  })

  it('成功执行后恢复失败必须拒绝，并等待所有清理操作完成', async () => {
    const output = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    const restoreError = new Error('successful run restore failed')
    mocks.mutate.mockImplementation(async () => {
      await writeFile(template, 'changed\n')
      return {
        fromClassToken: 'text-xs',
        toClassToken: 'text-lg',
        toEscapedClass: 'text-lg',
        hotUpdateOutputMs: 1,
        hotUpdateEffectiveMs: 1,
        rollbackOutputMs: 1,
        rollbackEffectiveMs: 1,
      }
    })
    watchCase.subPackageMutations = []
    mocks.write.mockImplementation(() => {
      throw restoreError
    })
    const error = await runMainStyleOnlyCase(watchCase, options).catch(error => error)
    expect(errorTree(error)).toContain(restoreError)
    expect(error.stack).toContain('successful run restore failed')
    expect(session.stop).toHaveBeenCalledOnce()
    expect(output.mock.calls.flat().join('')).not.toContain('passed')
  })

  it.each([runCase, runSubPackagesOnlyCase, runWebOnlyCase, runMainStyleOnlyCase])('恢复已删除的源码并保留混合换行原字节 %#', async (run) => {
    const original = 'first\r\nsecond\n'
    await writeFile(template, original)
    const primary = new Error('source deleted during mutation')
    mocks.mutate.mockImplementation(async () => {
      await rm(template)
      throw primary
    })
    const error = await run(watchCase, options).catch(error => error)
    expect(await readFile(template)).toEqual(Buffer.from(original))
    expect(errorTree(error)).toContain(primary)
    expect(error.stack).not.toContain('收尾失败')
  })

  it('已有主样式指标与清理失败同时保留，CLI stack 可见所有失败', async () => {
    const primary = new Error('subpackage mutation failed')
    const stopError = new Error('partial metrics session stop failed')
    mocks.mutate.mockImplementationOnce(async () => {
      await writeFile(template, 'changed\n')
      return {
        fromClassToken: 'text-xs',
        toClassToken: 'text-lg',
        toEscapedClass: 'text-lg',
        hotUpdateOutputMs: 1,
        hotUpdateEffectiveMs: 1,
        rollbackOutputMs: 1,
        rollbackEffectiveMs: 1,
      }
    }).mockRejectedValue(primary)
    vi.mocked(session.stop).mockRejectedValue(stopError)
    const error = await runMainStyleOnlyCase(watchCase, options).catch(error => error)
    expect(error).toBeInstanceOf(WatchHmrPartialMetricsError)
    expect(error.metrics.mainStyleHotUpdate.toClassToken).toBe('text-lg')
    expect(errorTree(error)).toContain(primary)
    expect(errorTree(error)).toContain(stopError)
    expect(error.stack).toContain(primary.message)
    expect(error.stack).toContain(stopError.message)
    expect(await readFile(template, 'utf8')).toBe('original\r\n')
  })
})
