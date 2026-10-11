import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  COMMENT_MARKER,
  buildReport,
  collectWatchReports,
  limitComment,
  mergeBenchmarkSummaries,
  renderMarkdown,
} from '../scripts/pr-report.mjs'

const temporaryRoots = []

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map(root => fs.rm(root, { recursive: true, force: true })))
})

function benchmarkSummary(key, overrides = {}) {
  return {
    value: {
      generatedAt: '2026-08-30T00:00:00.000Z',
      baseline: 'base:origin/main',
      current: 'current:5.0.0-next.1',
      options: { buildRuns: 3, hmrRuns: 6, timeoutMs: 180000 },
      compares: [{
        key,
        target: 'mp-weixin',
        baselineBuild: 100,
        currentBuild: 120,
        buildDeltaPct: 20,
        baselineHmrMedian: 10,
        currentHmrMedian: 12,
        baselineHmr: 20,
        currentHmr: 24,
        hmrDeltaPct: 20,
        baselineBuildSamples: [110, 95, 100],
        currentBuildSamples: [130, 115, 120],
        currentBuildPeakRssMb: 500,
        currentBuildSteadyRssMb: 450,
        currentHmrPeakRssMb: 600,
        currentHmrSteadyRssMb: 550,
      }],
      errors: [],
      performanceGuard: {
        passed: true,
        blocking: true,
        violations: [],
        observations: [],
        thresholds: { regressionPercent: 5 },
      },
      ...overrides,
    },
    file: `/artifacts/${key}/summary.json`,
  }
}

describe('PR benchmark report aggregation', () => {
  it('merges shards and reports missing expected projects without zero-filling', () => {
    const result = mergeBenchmarkSummaries([
      benchmarkSummary('demo-weapp-vite-tailwindcss-v4__mp-weixin'),
      benchmarkSummary('demo-taro-vite-react-tailwindcss-v4__mp-weixin'),
    ], [
      'demo-weapp-vite-tailwindcss-v4__mp-weixin',
      'demo-taro-vite-react-tailwindcss-v4__mp-weixin',
      'demo-mpx-tailwindcss-v4__mp-weixin',
    ])

    expect(result.shardCount).toBe(2)
    expect(result.availableKeys).toHaveLength(2)
    expect(result.missingKeys).toEqual(['demo-mpx-tailwindcss-v4__mp-weixin'])
    expect(result.compares[0].currentBuildPeakRssMb).toBe(500)
    expect(result.averages.buildDeltaPct).toBe(20)
  })

  it('collects full watch reports and combines speed with memory', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'weapp-pr-report-'))
    temporaryRoots.push(root)
    await fs.writeFile(path.join(root, '2026-08-30T00-00-00-000Z-example.json'), JSON.stringify({
      cases: [{
        project: 'demo/example',
        platform: 'mp-weixin',
        initialReadyMs: 120,
        summary: { count: 4, avgMs: 30, minMs: 10, maxMs: 80, p50Ms: 20, p95Ms: 80 },
        pluginProcessSummary: { count: 4, avgMs: 8, minMs: 4, maxMs: 12, p50Ms: 8, p95Ms: 12 },
        summaryByMutationKind: { style: { count: 1, avgMs: 80, minMs: 80, maxMs: 80, p50Ms: 80, p95Ms: 80 } },
        memory: { sampleCount: 4, debugSampleCount: 2, peakRssMb: 700, rssDeltaMb: 100, peakHeapUsedMb: 300 },
      }],
    }))

    const result = await collectWatchReports(root)
    expect(result.available).toBe(true)
    expect(result.rows).toHaveLength(2)
    expect(result.rows.find(row => row.mutation === 'all').peakRssMb).toBe(700)
    expect(result.rows.find(row => row.mutation === 'style').p95Ms).toBe(80)
  })

  it('reads generated speed and memory summaries when raw reports are unavailable', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'weapp-pr-report-summary-'))
    temporaryRoots.push(root)
    await fs.writeFile(path.join(root, 'hmr-speed-report.json'), JSON.stringify({
      byProject: {
        'demo/example': {
          platforms: {
            'mp-weixin': { count: 2, avgMs: 25, minMs: 10, maxMs: 40, p50Ms: 20, p95Ms: 40 },
          },
        },
      },
    }))
    await fs.writeFile(path.join(root, 'hmr-memory-report.json'), JSON.stringify({
      byProject: {
        'demo/example': {
          platforms: {
            'mp-weixin': { sampleCount: 2, peakRssMb: 800, rssDeltaMb: 80, peakHeapUsedMb: 350 },
          },
        },
      },
    }))

    const result = await collectWatchReports(root)
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0]).toMatchObject({ project: 'demo/example', platform: 'mp-weixin', p95Ms: 40, peakRssMb: 800 })
    expect(result.summary.peakHeapUsedMb).toBe(350)
  })

  it('renders escaped diagnostics and keeps the comment under the configured limit', () => {
    const report = buildReport({
      benchmark: mergeBenchmarkSummaries([benchmarkSummary('demo-weapp-vite-tailwindcss-v4__mp-weixin')], ['demo-weapp-vite-tailwindcss-v4__mp-weixin']),
      watch: { available: false, rows: [], errors: [] },
      missingArtifacts: ['E2E Watch HMR reports'],
      commit: { sha: 'abcdef1234567890' },
      runs: { benchmark: { conclusion: 'success' }, watch: { conclusion: 'skipped' } },
    })
    const markdown = renderMarkdown(report)
    expect(markdown).toContain(COMMENT_MARKER)
    expect(markdown).toContain('未触发/无产物')
    expect(markdown).not.toContain('undefined')
    const limited = limitComment(`${markdown}${'x'.repeat(70000)}`, 1000)
    expect(limited.truncated).toBe(true)
    expect(Buffer.byteLength(limited.markdown, 'utf8')).toBeLessThanOrEqual(1000)
  })
})
