import path from 'node:path'
import process from 'node:process'

export const COMPILATION_EVENT_SCHEMA_VERSION = 1

export interface CompilationDiagnosticEvent {
  schemaVersion: typeof COMPILATION_EVENT_SCHEMA_VERSION
  type: 'diagnostic'
  timestamp: string
  projectId?: string
  compilerId?: string
  adapter?: string
  phase: 'scan' | 'candidate' | 'generate' | 'postcss' | 'emit' | 'hmr'
  revision?: number
  operationId?: string
  durationMs?: number
  cache?: { hit: boolean, key?: string, reason?: string }
  moduleId?: string
  sourceId?: string
  error?: { name?: string, message: string, stack?: string }
  evidence?: string[]
}

export type CompilationEvent
  = | CompilationDiagnosticEvent
    | {
      type: 'source-updated'
      id: string
      source: string
      sourceKind?: 'css' | 'template' | 'script' | 'config' | 'asset'
    }
    | { type: 'source-removed', id: string }
    | { type: 'css-entry', id: string, source: string }
    | { type: 'bundle-emitted', file: string, artifact?: unknown }
    | { type: 'hot-update', id: string, mutation: 'template' | 'script' | 'style' | 'content' | 'subpackage' | 'root-style' }
    | { type: 'config-changed', id?: string }

export type CompilationEventListener = (event: CompilationEvent) => void | Promise<void>

export interface CompilationEventBus {
  readonly revision: number
  emit: (event: CompilationEvent) => Promise<number>
  subscribe: (listener: CompilationEventListener) => () => void
  clear: () => void
}

export interface CompilationEventReporter {
  readonly events: readonly CompilationEvent[]
  collect: CompilationEventListener
  toJSONL: () => string
  summarize: () => string
  clear: () => void
}

/** 创建轻量事件收集器，可同时用于本地诊断和 CI JSONL 输出。 */
export function createCompilationEventReporter(): CompilationEventReporter {
  const events: CompilationEvent[] = []
  return {
    get events() { return events },
    collect(event) { events.push(event) },
    toJSONL() { return events.map(serializeCompilationEvent).join('\n') },
    summarize() { return summarizeCompilationEvents(events) },
    clear() { events.length = 0 },
  }
}

export function redactCompilationPath(value: string, root = process.cwd()): string {
  const normalized = value.replaceAll('\\', path.sep)
  const relative = path.relative(root, normalized)
  if (relative && !relative.startsWith('..') && !path.isAbsolute(relative)) {
    return relative
  }
  return path.basename(normalized)
}

export function serializeCompilationEvent(event: CompilationEvent): string {
  return JSON.stringify(event)
}

export function summarizeCompilationEvents(events: readonly CompilationEvent[]): string {
  const diagnostics = events.filter((event): event is CompilationDiagnosticEvent => event.type === 'diagnostic')
  const failures = diagnostics.filter(event => event.error)
  const duration = diagnostics.reduce((sum, event) => sum + (event.durationMs ?? 0), 0)
  const cacheHits = diagnostics.filter(event => event.cache?.hit).length
  return `事件 ${events.length} 条，诊断 ${diagnostics.length} 条，失败 ${failures.length} 条，总耗时 ${duration.toFixed(2)}ms，缓存命中 ${cacheHits} 条`
}

/** 创建跨 bundler 共用的生命周期事件总线。 */
export function createCompilationEventBus(): CompilationEventBus {
  const listeners = new Set<CompilationEventListener>()
  let revision = 0

  return {
    get revision() {
      return revision
    },
    async emit(event) {
      revision += 1
      for (const listener of [...listeners]) {
        await listener(event)
      }
      return revision
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    clear() {
      listeners.clear()
    },
  }
}
