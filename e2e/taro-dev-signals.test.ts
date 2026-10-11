import { describe, expect, it } from 'vitest'
import { createTaroDevSignalCollector, parseTaroDevSignalLine, TARO_BUILD_ERROR_RE, TARO_COMPILED_RE } from './watch/taro-dev-signals'

describe('Taro dev 完成信号', () => {
  it('捕获明确编译失败，不将普通警告当作失败', () => {
    expect(TARO_BUILD_ERROR_RE.test('Module runtime that is marked with syntheticNamedExports needs an explicit export')).toBe(true)
    expect(TARO_BUILD_ERROR_RE.test('webpack compiled with 2 errors')).toBe(true)
    expect(TARO_BUILD_ERROR_RE.test('Error during build')).toBe(true)
    expect(TARO_BUILD_ERROR_RE.test('webpack compiled with warnings')).toBe(false)
  })

  it.each(['900 modules transformed.', 'rendering chunks...', 'watching for file changes...', 'Module "runtime/index.js" that is marked with syntheticNamedExports needs an explicit export'])('不把中间阶段或错误当作成功：%s', (line) => {
    expect(TARO_COMPILED_RE.test(line)).toBe(false)
  })

  it.each(['built in 8266ms.', 'built in 1.25s.', 'Compiled successfully in 3.2s', 'webpack 5.105.4 compiled successfully in 600 ms'])('识别最终构建完成：%s', (line) => {
    expect(TARO_COMPILED_RE.test(line)).toBe(true)
  })

  it('先规范化 CI 的彩色日志，再识别最终完成状态', () => {
    expect(parseTaroDevSignalLine('\u001B[36mbuilt in 20385ms.\u001B[39m').compiled).toBe(true)
    expect(parseTaroDevSignalLine('\u001B[36mwatching for file changes...\u001B[39m').watchReady).toBe(true)
    expect(parseTaroDevSignalLine('\u001B[31mcompiled with 2 errors\u001B[39m').buildFailed).toBe(true)
  })

  it('完成信号不受 stdout 分块边界影响，也不会把同一行重复计数', () => {
    const line = '\u001B[36mbuilt in 20385ms.\u001B[39m\r\n'
    for (let split = 1; split < line.length; split += 1) {
      const signals: ReturnType<typeof parseTaroDevSignalLine>[] = []
      const collector = createTaroDevSignalCollector(signal => signals.push(signal))
      collector.push(line.slice(0, split), 'stdout')
      collector.push(line.slice(split), 'stdout')
      collector.flush()
      expect(signals.filter(signal => signal.compiled), `split=${split}`).toHaveLength(1)
    }
  })

  it('逐行计数多次构建，并隔离 stdout/stderr 的半行日志', () => {
    const signals: ReturnType<typeof parseTaroDevSignalLine>[] = []
    const collector = createTaroDevSignalCollector(signal => signals.push(signal))
    collector.push('built in ', 'stdout')
    collector.push('build ', 'stderr')
    collector.push('1s.\nbuilt in 2s.\nwatching for file changes...\n', 'stdout')
    collector.push('failed', 'stderr')
    collector.flush()
    collector.flush()
    expect(signals.filter(signal => signal.compiled)).toHaveLength(2)
    expect(signals.filter(signal => signal.watchReady)).toHaveLength(1)
    expect(signals.filter(signal => signal.buildFailed)).toHaveLength(1)
  })
})
