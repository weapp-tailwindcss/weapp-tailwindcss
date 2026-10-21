import type { NativeErrorDiagnostics, NativeErrorNode } from '../../examples/react-lynx/src/compatibility/native-error-diagnostics'

const diagnosticFields = new WeakMap<Error, Pick<NativeErrorNode, 'context' | 'truncated'>>()

export function nativeDiagnosticFields(error: unknown): Pick<NativeErrorNode, 'context' | 'truncated'> | undefined {
  return error instanceof Error ? diagnosticFields.get(error) : undefined
}

/** 诊断树只还原普通错误，不根据错误名或内容生成环境错误。 */
export function restoreNativeError(node: NativeErrorNode): Error {
  const cause = node.cause ? restoreNativeError(node.cause) : undefined
  const error = node.errors
    ? new AggregateError(node.errors.map(restoreNativeError), node.message, { cause })
    : new Error(node.message, { cause })
  error.name = node.name
  diagnosticFields.set(error, { context: node.context, truncated: node.truncated })
  if (node.stack) {
    error.stack = node.stack
  }
  return error
}

export function formatNativeErrorDiagnostics(diagnostics: NativeErrorDiagnostics): string {
  const visit = (node: NativeErrorNode, indent: string): string => {
    const context = node.context ? ` ${JSON.stringify(node.context)}` : ''
    const truncated = node.truncated ? ` [truncated:${node.truncated}]` : ''
    return [
      `${indent}${node.name}: ${node.message}${context}${truncated}`,
      ...(node.errors ?? []).map((nested, index) => `${indent}errors[${index}]:\n${visit(nested, `${indent}  `)}`),
      ...(node.cause ? [`${indent}cause:\n${visit(node.cause, `${indent}  `)}`] : []),
    ].join('\n')
  }
  return visit(diagnostics.error, '')
}
