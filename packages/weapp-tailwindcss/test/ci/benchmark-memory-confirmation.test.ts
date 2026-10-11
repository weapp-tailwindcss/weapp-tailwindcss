import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildSummary, evaluatePerformanceGuard } from '../../../../benchmark/version-compare/scripts/ci-report.mjs'
import { runHmrMemoryConfirmation } from '../../../../benchmark/version-compare/scripts/memory-confirmation.mjs'

const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => fs.rm(root, { recursive: true, force: true })))
})

function rawResult(currentRss = 1000, missingMemory = false, error?: string) {
  return {
    rows: [['base:main', 1000], ['current:feature', currentRss]].map(([version, rss]) => ({
      version,
      key: 'framework',
      hmrMode: 'watch',
      hmrMs: [100, 100, 100],
      error,
      summary: {
        hmr: { median: 100, p95: 100 },
        ...(missingMemory
          ? {}
          : {
              hmrPeakRssMb: { median: rss },
              hmrSteadyRssMb: { median: rss },
            }),
      },
    })),
  }
}

async function fixture() {
  const resultDir = await fs.mkdtemp(path.join(os.tmpdir(), 'benchmark-confirmation-'))
  roots.push(resultDir)
  const baselineVersion = { version: 'base:main', root: path.join(resultDir, 'base') }
  const currentVersion = { version: 'current:feature', root: path.join(resultDir, 'current') }
  const performanceGuard = evaluatePerformanceGuard(buildSummary(rawResult(1400), baselineVersion.version, currentVersion.version))
  expect(performanceGuard.passed).toBe(false)
  expect(performanceGuard.violations.map(item => item.metric)).toEqual(['hmrPeakRssMb', 'hmrSteadyRssMb'])
  return { resultDir, baselineVersion, currentVersion, performanceGuard, regressionPercent: 5 }
}

describe('benchmark HMR 内存反向确认', () => {
  it.each([false, true])('实际执行器收到 current→baseline、零 build 和完整身份，诊断开关为 %s', async (diagnostics) => {
    const options = await fixture()
    const versions = diagnostics
      ? {
          currentVersion: { ...options.currentVersion, diagnosticIdentity: { role: 'current', sourceCommit: 'candidate-sha' } },
          baselineVersion: { ...options.baselineVersion, diagnosticIdentity: { role: 'base', sourceCommit: 'base-sha' } },
        }
      : options
    const original = structuredClone(versions)
    const runMatrix = vi.fn(async ({ versionsFile, outputFile, matrixBuildRuns }) => {
      expect(matrixBuildRuns).toBe(0)
      expect(JSON.parse(await fs.readFile(versionsFile, 'utf8'))).toEqual([versions.currentVersion, versions.baselineVersion])
      await fs.writeFile(outputFile, JSON.stringify(rawResult()), 'utf8')
    })

    const result = await runHmrMemoryConfirmation({ ...options, ...versions, runMatrix })

    expect(runMatrix).toHaveBeenCalledExactlyOnceWith({
      versionsFile: path.join(options.resultDir, 'memory-confirmation-versions.json'),
      outputFile: path.join(options.resultDir, 'memory-confirmation-raw.json'),
      matrixBuildRuns: 0,
    })
    expect(result).toMatchObject({ passed: true, violations: [], memoryConfirmation: { order: 'current->baseline', confirmedViolations: 0 } })
    expect(result.observations).toHaveLength(2)
    expect(versions).toEqual(original)
    const summary = JSON.parse(await fs.readFile(path.join(options.resultDir, 'memory-confirmation-summary.json'), 'utf8'))
    expect(summary).toMatchObject({ baseline: 'base:main', current: 'current:feature', errors: [] })
    expect(summary.compares[0]).toMatchObject({ baselineHmrPeakRssMb: 1000, currentHmrPeakRssMb: 1000 })
  })

  it('两项 RSS 再次超限时保留原失败和准确确认值', async () => {
    const options = await fixture()
    const result = await runHmrMemoryConfirmation({
      ...options,
      runMatrix: async ({ outputFile }) => fs.writeFile(outputFile, JSON.stringify(rawResult(1300)), 'utf8'),
    })
    expect(result.passed).toBe(false)
    expect(result.memoryConfirmation).toMatchObject({ confirmedViolations: 2 })
    expect(result.violations).toHaveLength(2)
    for (const violation of result.violations) {
      expect(violation).toMatchObject({ baseline: 1000, current: 1400, confirmation: { baseline: 1000, current: 1300, absoluteDelta: 300, deltaPercent: 30 } })
    }
  })

  it.each([
    { raw: rawResult(1300, false, 'fixture failed'), error: 'matrix has 2 failed row(s)' },
    { raw: rawResult(1300, true), error: 'matrix has incomplete RSS samples' },
  ])('确认缺证时保留主轮失败：$error', async ({ raw, error }) => {
    const options = await fixture()
    const result = await runHmrMemoryConfirmation({
      ...options,
      runMatrix: async ({ outputFile }) => fs.writeFile(outputFile, JSON.stringify(raw), 'utf8'),
    })
    expect(result).toMatchObject({ passed: false, memoryConfirmation: { error } })
    expect(result.violations.map(item => [item.metric, item.baseline, item.current]))
      .toEqual(options.performanceGuard.violations.map(item => [item.metric, item.baseline, item.current]))
  })

  it('矩阵进程失败原样传播，不写成功 summary', async () => {
    const options = await fixture()
    const failure = new Error('matrix child exited 1')
    const runMatrix = vi.fn().mockRejectedValue(failure)
    await expect(runHmrMemoryConfirmation({ ...options, runMatrix })).rejects.toBe(failure)
    expect(runMatrix).toHaveBeenCalledTimes(1)
    await expect(fs.stat(path.join(options.resultDir, 'memory-confirmation-summary.json'))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('确认原始产物损坏时拒绝，不把解析失败降级为通过', async () => {
    const options = await fixture()
    await expect(runHmrMemoryConfirmation({
      ...options,
      runMatrix: async ({ outputFile }) => fs.writeFile(outputFile, '{broken', 'utf8'),
    })).rejects.toBeInstanceOf(SyntaxError)
    await expect(fs.stat(path.join(options.resultDir, 'memory-confirmation-summary.json'))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('使用调用方原 regressionPercent，确认不另设门槛', async () => {
    const options = await fixture()
    const result = await runHmrMemoryConfirmation({
      ...options,
      regressionPercent: 11,
      runMatrix: async ({ outputFile }) => fs.writeFile(outputFile, JSON.stringify(rawResult(1100)), 'utf8'),
    })
    expect(result).toMatchObject({ passed: true, memoryConfirmation: { confirmedViolations: 0 } })
  })
})
