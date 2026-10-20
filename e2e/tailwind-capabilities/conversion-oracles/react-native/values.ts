import postcss from 'postcss'

/** 只接收隔离官方参考的无条件根变量；局部级联、条件主题和多重定义不进入合同。 */
export function reviewedNativeVariables(css: string): ReadonlyMap<string, string> {
  const definitions = new Map<string, Set<string>>()
  const blocked = new Set<string>()
  postcss.parse(css).walkDecls(/^--/, (declaration) => {
    let parent = declaration.parent
    let global = false
    while (parent && parent.type !== 'root') {
      if (parent.type === 'rule') {
        if (!/^:root\s*,\s*:host$|^:root$|^:host$/.test(parent.selector.trim())) {
          blocked.add(declaration.prop)
          return
        }
        global = true
      }
      if (parent.type === 'atrule' && parent.name !== 'layer') {
        blocked.add(declaration.prop)
        return
      }
      parent = parent.parent
    }
    if (global) {
      const values = definitions.get(declaration.prop) ?? new Set<string>()
      values.add(declaration.value.trim())
      definitions.set(declaration.prop, values)
    }
  })
  return new Map([...definitions].flatMap(([name, values]) => !blocked.has(name) && values.size === 1 ? [[name, [...values][0]!] as const] : []))
}

/** 预期只解析精确变量引用与 spacing 的单次乘法；复杂表达式仍保留缺口。 */
export function reviewedNativeLiteral(input: string, variables: ReadonlyMap<string, string>, visited = new Set<string>()): string | undefined {
  const value = input.trim()
  const variable = /^var\((--[\w-]+)\)$/.exec(value)
  if (variable) {
    const name = variable[1]!
    if (visited.has(name) || !variables.has(name)) {
      return undefined
    }
    return reviewedNativeLiteral(variables.get(name)!, variables, new Set([...visited, name]))
  }
  const spacing = /^calc\(var\((--[\w-]+)\)\s*\*\s*(-?(?:\d+(?:\.\d+)?|\.\d+))\)$/.exec(value)
  if (spacing) {
    const resolved = reviewedNativeLiteral(`var(${spacing[1]})`, variables, visited)
    return resolved ? `calc(${resolved} * ${spacing[2]})` : undefined
  }
  return /var\(/.test(value) ? undefined : value
}

/** 默认根字号固定 16；em 依赖宿主字号，不使用产品的 16px 假设作为 oracle。 */
export function reviewedNativeNumber(value: string, percentage: boolean): number | string | undefined {
  const match = /^(-?(?:\d+(?:\.\d+)?|\.\d+))(px|rem|%)?$/.exec(value)
  if (match) {
    const number = Number(match[1])
    if (!Number.isFinite(number)) {
      return undefined
    }
    const resolved = number * (match[2] === 'rem' ? 16 : 1)
    return Number.isFinite(resolved) ? match[2] === '%' ? percentage ? `${number}%` : undefined : resolved : undefined
  }
  const multiplication = /^calc\((-?(?:\d+(?:\.\d+)?|\.\d+))(px|rem)?\s*\*\s*(-?(?:\d+(?:\.\d+)?|\.\d+))\)$/.exec(value)
  if (multiplication) {
    const number = Number(multiplication[1]) * (multiplication[2] === 'rem' ? 16 : 1) * Number(multiplication[3])
    return Number.isFinite(number) ? number : undefined
  }
  return undefined
}

export function reviewedNativeColor(value: string) {
  return /^(?:#[\da-f]{3}|#[\da-f]{4}|#[\da-f]{6}|#[\da-f]{8}|black|white|transparent)$/i.test(value) ? value : undefined
}
