import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { measureWatchLifecycle } from '../src/watch-lifecycle.mjs'
import { joinWatchMeasurement } from './helpers/watch-measurement.mjs'

describe('真实 watcher 基准契约', () => {
  it.for(['vite', 'webpack'])('%s 连续变更后恢复一致产物', { timeout: 30_000 }, async (kind, context) => {
    const report = await joinWatchMeasurement(context, measureWatchLifecycle({
      sourceRoot: fileURLToPath(new URL('../../..', import.meta.url)),
      kind,
      size: 3,
      warmups: 0,
      runs: 3,
      signal: context.signal,
    }))
    expect(report.samples).toHaveLength(3)
    expect(new Set(report.samples.map(sample => sample.outputHash)).size).toBe(1)
    expect(report.time.count).toBe(3)
    expect(report.outputCss).toBe(await readFile(new URL(`./fixtures/watch/${kind}.css`, import.meta.url), 'utf8'))
  })
})
