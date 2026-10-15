import { describe, expect, it } from 'vitest'
import { formatWatchFailure } from '../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/error-report'

describe('watch failure diagnostics', () => {
  it('retains the provider phase through nested causes and aggregate cleanup failures', () => {
    const query = new Error('请求超时；diagnostics={"phase":"request-received","id":1}')
    const close = new Error('采集器退出未确认')
    const source = new Error('采集会话失效', { cause: new AggregateError([query, close], '查询及收尾失败') })
    const error = new Error('业务尚未启动：Watch 内存采集器准备失败。', { cause: source })
    const report = formatWatchFailure(error)

    for (const failure of [error, source, query, close]) {
      expect(report).toContain(failure.message)
    }
    expect(report).toContain('watch-hmr-error-report.unit.test.ts')
  })

  it('handles circular causes without losing the original failure', () => {
    const error = new Error('circular provider failure')
    error.cause = error
    expect(formatWatchFailure(error)).toContain(error.message)
  })

  it.each(['raw failure', undefined, null, 42])('preserves a non-Error failure: %s', (error) => {
    expect(formatWatchFailure(error)).toBe(String(error))
  })
})
