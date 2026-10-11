import { describe, expect, it } from 'vitest'
import {
  COMPILATION_EVENT_SCHEMA_VERSION,
  createCompilationEventBus,
  createCompilationEventReporter,
  redactCompilationPath,
  serializeCompilationEvent,
  summarizeCompilationEvents,
} from '../../src/compiler/events'

describe('编译诊断事件', () => {
  it('保留旧事件总线并按顺序递增 revision', async () => {
    const bus = createCompilationEventBus()
    const revisions: number[] = []
    bus.subscribe(async (event) => {
      if (event.type === 'diagnostic') revisions.push(bus.revision)
    })
    await bus.emit({ schemaVersion: COMPILATION_EVENT_SCHEMA_VERSION, type: 'diagnostic', timestamp: new Date(0).toISOString(), phase: 'scan', durationMs: 2, cache: { hit: true } })
    expect(revisions).toEqual([1])
    expect(bus.revision).toBe(1)
  })

  it('序列化并生成摘要', () => {
    const event = { schemaVersion: 1 as const, type: 'diagnostic' as const, timestamp: new Date(0).toISOString(), phase: 'generate' as const, durationMs: 4, cache: { hit: false }, error: { message: 'failed' } }
    expect(JSON.parse(serializeCompilationEvent(event))).toMatchObject({ phase: 'generate' })
    expect(summarizeCompilationEvents([event])).toContain('失败 1 条')
  })

  it('收集器输出 JSONL 与摘要', async () => {
    const reporter = createCompilationEventReporter()
    await reporter.collect({ schemaVersion: 1, type: 'diagnostic', timestamp: new Date(0).toISOString(), phase: 'emit', durationMs: 1, cache: { hit: true } })
    expect(reporter.events).toHaveLength(1)
    expect(reporter.toJSONL().split('\n')).toHaveLength(1)
    expect(reporter.summarize()).toContain('缓存命中 1 条')
    reporter.clear()
    expect(reporter.events).toHaveLength(0)
  })

  it('脱敏绝对路径并支持 Windows 分隔符', () => {
    expect(redactCompilationPath('/workspace/project/src/app.ts', '/workspace/project')).toBe('src/app.ts')
    expect(redactCompilationPath('C:\\work\\project\\src\\app.ts', 'C:\\work\\project')).toContain('app.ts')
  })
})
