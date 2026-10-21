import { nativeEvidenceFailureIn } from './native-failure'

export interface NativeOperationContext {
  phase: 'light' | 'dark' | 'restored'
  operation: 'switch' | 'capture' | 'save'
  runId: string
  requestId: string
  node?: string
  artifact?: string
}

export class NativeOperationError extends Error {
  constructor(readonly context: NativeOperationContext, cause: unknown) {
    super(`原生颜色模式 ${context.phase}/${context.operation} 失败`, { cause })
    this.name = 'NativeOperationError'
  }
}

export interface NativeErrorNode {
  name: string
  message: string
  stack?: string
  context?: NativeOperationContext
  errors?: NativeErrorNode[]
  cause?: NativeErrorNode
  truncated?: string
}

export interface NativeErrorDiagnostics {
  version: 1
  source: 'lynx-native-report-failure'
  error: NativeErrorNode
}

const maxNodes = 32
const maxDepth = 8
const maxMessage = 1024
const maxStack = 4096
const contextKeys = ['phase', 'operation', 'runId', 'requestId', 'node', 'artifact'] as const

function safeString(value: unknown): string {
  try {
    return String(value)
  }
  catch {
    return '[无法转为文本的抛出值]'
  }
}

/** 有界保留错误树；截断必须可见，不能因循环或非 Error 抛出值丢失整份诊断。 */
export function nativeErrorDiagnostics(error: unknown): NativeErrorDiagnostics {
  let count = 0
  const queue: { value: Error, node: NativeErrorNode, depth: number, ancestors: Set<unknown> }[] = []
  const visit = (value: unknown, depth: number, ancestors: Set<unknown>): NativeErrorNode => {
    count++
    const thrownText = value instanceof Error ? '' : safeString(value)
    const node: NativeErrorNode = { name: 'ThrownValue', message: thrownText.slice(0, maxMessage) }
    if (!(value instanceof Error)) {
      if (thrownText.length > maxMessage) {
        node.truncated = 'text-limit'
      }
      return node
    }
    const field = (key: 'name' | 'message' | 'stack', limit: number, fallback: string): string => {
      try {
        const text = safeString(value[key] ?? fallback)
        if (text.length > limit) {
          node.truncated = 'text-limit'
        }
        return text.slice(0, limit)
      }
      catch {
        node.truncated = 'unreadable-error-property'
        return fallback
      }
    }
    node.name = field('name', 128, 'Error')
    node.message = field('message', maxMessage, '[无法读取错误消息]')
    node.stack = field('stack', maxStack, '')
    if (ancestors.has(value) || depth === maxDepth) {
      node.truncated = ancestors.has(value) ? 'cycle' : 'depth-limit'
      return node
    }
    try {
      if (value instanceof NativeOperationError) {
        node.context = Object.fromEntries(contextKeys.flatMap((key) => {
          const text = value.context[key]
          if (typeof text !== 'string') {
            return []
          }
          if (text.length > 256) {
            node.truncated = 'text-limit'
          }
          return [[key, text.slice(0, 256)]]
        })) as unknown as NativeOperationContext
      }
    }
    catch {
      node.truncated = 'unreadable-error-property'
    }
    queue.push({ value, node, depth, ancestors: new Set([...ancestors, value]) })
    return node
  }
  const root = visit(error, 0, new Set())
  // 同层先分配节点，防止首条深因果链耗尽预算并静默遮住恢复错误。
  for (let index = 0; index < queue.length; index++) {
    const { value, node, depth, ancestors } = queue[index]!
    try {
      if (value instanceof AggregateError) {
        node.errors = []
        if (!Array.isArray(value.errors)) {
          throw new TypeError('聚合错误的 errors 不是数组')
        }
        for (const nested of value.errors) {
          if (count >= maxNodes) {
            node.truncated = 'node-limit'
            break
          }
          node.errors.push(visit(nested, depth + 1, ancestors))
        }
      }
    }
    catch {
      node.truncated = 'unreadable-error-property'
    }
    try {
      if (value.cause !== undefined) {
        if (count < maxNodes) {
          node.cause = visit(value.cause, depth + 1, ancestors)
        }
        else {
          node.truncated = 'node-limit'
        }
      }
    }
    catch {
      node.truncated = 'unreadable-error-property'
    }
  }
  return { version: 1, source: 'lynx-native-report-failure', error: root }
}

/** 分类仍由原始明确环境协议决定，诊断树中的名称、文本和上下文均不参与分类。 */
export function nativeReportFailureMessage(error: unknown): string {
  const diagnostics = nativeErrorDiagnostics(error)
  const failure = nativeEvidenceFailureIn(error)
  return JSON.stringify(failure ? { ...failure, diagnostics } : diagnostics)
}

/** 不信任跨桥 JSON；过期、截断或无界错误树只作为普通原始消息保存。 */
export function readNativeErrorDiagnostics(value: unknown): NativeErrorDiagnostics | undefined {
  if (!value || typeof value !== 'object') {
    return
  }
  const envelope = value as Partial<NativeErrorDiagnostics>
  if (envelope.version !== 1 || envelope.source !== 'lynx-native-report-failure') {
    return
  }
  let count = 0
  const validate = (candidate: unknown, depth: number): candidate is NativeErrorNode => {
    if (++count > maxNodes || depth > maxDepth || !candidate || typeof candidate !== 'object') {
      return false
    }
    const node = candidate as NativeErrorNode
    if (typeof node.name !== 'string' || node.name.length > 128 || typeof node.message !== 'string' || node.message.length > maxMessage
      || (node.stack !== undefined && (typeof node.stack !== 'string' || node.stack.length > maxStack))
      || (node.truncated !== undefined && !['cycle', 'depth-limit', 'node-limit', 'text-limit', 'unreadable-error-property'].includes(node.truncated))) {
      return false
    }
    if (node.context !== undefined) {
      const context = node.context
      if (!context || typeof context !== 'object' || !['light', 'dark', 'restored'].includes(context.phase)
        || !['switch', 'capture', 'save'].includes(context.operation)
        || typeof context.runId !== 'string' || typeof context.requestId !== 'string'
        || Object.keys(context).some(key => !contextKeys.includes(key as typeof contextKeys[number]))
        || contextKeys.some(key => context[key] !== undefined && (typeof context[key] !== 'string' || context[key]!.length > 256))) {
        return false
      }
    }
    return (node.errors === undefined || (Array.isArray(node.errors) && node.errors.length <= maxNodes && node.errors.every(nested => validate(nested, depth + 1))))
      && (node.cause === undefined || validate(node.cause, depth + 1))
  }
  return validate(envelope.error, 0) ? envelope as NativeErrorDiagnostics : undefined
}
