type WorkflowContext = Record<string, Record<string, unknown>>

function resolveReference(expression: string, context: WorkflowContext): unknown {
  const text = expression.trim()
  if (/^'[^']*'$/.test(text)) {
    return text.slice(1, -1)
  }
  if (/^\d+$/.test(text)) {
    return Number(text)
  }
  const reference = /^(matrix|github)(?:\.([\w.]+)|\['([^']+)'\])$/.exec(text)
  if (!reference) {
    throw new Error(`未支持的 workflow 合同表达式：${text}`)
  }
  const fields = reference[2]?.split('.') ?? [reference[3]!]
  let value: unknown = context[reference[1]!]
  for (const field of fields) {
    if (value == null) {
      return ''
    }
    value = (value as Record<string, unknown>)[field]
  }
  return value ?? ''
}

/** 解析合同实际使用的 matrix/github 引用和 fallback；未知语法立即失败，不猜测执行结果。 */
export function resolveWorkflowMatrixValue(
  value: unknown,
  matrix: Record<string, unknown>,
  github: Record<string, unknown> = {},
) {
  return String(value ?? '').replace(/\$\{\{([^}]*)\}\}/g, (_match, expression: string) => {
    const branches = expression.split('||')
    const values = branches.map(branch => resolveReference(branch, { matrix, github }))
    return String(values.find(Boolean) ?? values.at(-1) ?? '')
  })
}

/** YAML alias 已在解析阶段展开，这里只按实际矩阵行还原该轮进程环境。 */
export function resolveWorkflowMatrixEnv(env: Record<string, unknown>, matrix: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(env).map(([key, value]) => [key, resolveWorkflowMatrixValue(value, matrix)]))
}
