import { expect, it } from 'vitest'
import { entryMarkdown, summarizeEntries } from '../../scripts/source-generation/entry-report.mjs'

it('入口摘要不把缺样本或根入口的不存在初始化解释为零开销', () => {
  const report = { samples: [], errors: [], environment: {}, scope: '诊断' }
  const summary = summarizeEntries(report)
  expect(summary.errors.length).toBeGreaterThan(0)
  expect(summary.rows.every(row => row.difference === null)).toBe(true)
  expect(summary.rows.some(row => row.entry === 'weapp-tailwindcss' && row.field === 'initializeMs')).toBe(false)
  expect(entryMarkdown(report, summary.rows)).toContain('N/A')
})

it('按批次独立统计，保留真实改善并拒绝重复样本', () => {
  const report = { samples: ['before', 'after'].flatMap(variant => Array.from({ length: 7 }, (_, round) => ({ variant, batch: 'first', metric: 'install.offline', round, ms: variant === 'before' ? 100 : 80, peakRssMb: 64 }))) }
  const row = summarizeEntries(report).rows.find(row => row.batch === 'first' && row.metric === 'install.offline' && row.field === 'ms')
  expect(row.summary.before.count).toBe(7)
  expect(row.difference).toEqual({ absolute: -20, percent: -20 })
  report.samples[1] = report.samples[0]
  expect(summarizeEntries(report).rows[0].difference).toBeNull()
})

it('拒绝数量齐全但含非有限值的样本', () => {
  const report = { samples: ['before', 'after'].flatMap(variant => Array.from({ length: 7 }, (_, round) => ({ variant, batch: 'first', metric: 'install.offline', round, ms: round === 0 ? null : 100, peakRssMb: 64 }))) }
  expect(summarizeEntries(report).rows[0].difference).toBeNull()
})
