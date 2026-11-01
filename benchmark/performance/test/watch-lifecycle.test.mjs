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
    const events = report.watchReceipt.events
    expect(events.filter(event => event.event === 'sample-restored').at(-1)).toMatchObject({ index: 2 })
    expect(events.filter(event => event.event === 'sample-created').at(-1)).toMatchObject({ index: 2 })
    expect(events.map(event => event.event)).toEqual(expect.arrayContaining(['report-start', 'report-created', 'action-complete', 'result-created', 'remove-start', 'remove-complete']))
    expect(events.at(-1).event).toBe('operation-complete')
    const closedResources = events.filter(event => event.event === 'close-complete').map(event => event.resource)
    expect(closedResources).toEqual(kind === 'vite' ? ['vite-watcher'] : ['webpack-watcher', 'webpack-compiler', 'webpack-resources'])
    expect(new Set(report.samples.map(sample => sample.outputHash)).size).toBe(1)
    expect(report.time.count).toBe(3)
    expect(report.outputCss).toBe(await readFile(new URL(`./fixtures/watch/${kind}.css`, import.meta.url), 'utf8'))
  })
})
