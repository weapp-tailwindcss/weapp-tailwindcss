import ts from 'typescript'

export interface ClassAlternative {
  tokens: Set<string>
  references: Set<string>
}

export interface OutputTokenGroup {
  tokens: Set<string>
  scopesByToken: Map<string, Set<string>>
}

export function splitClassTokens(value: string) {
  return new Set(value.split(/\s+/).filter(Boolean))
}

export function isSafeClass(token: string) {
  return /^wtu-[\da-z]+-[\da-z]+$/i.test(token)
}

export function isScopeClass(token: string) {
  return /^data-v-[\da-z]+$/i.test(token)
}

const empty = (): ClassAlternative => ({ tokens: new Set(), references: new Set() })

function combine(left: ClassAlternative[], right: ClassAlternative[]) {
  // 超出可证明分支预算时停止展开，不合并互斥分支作为通过证据。
  if (left.length * right.length > 128) {
    return undefined
  }
  return left.flatMap(a => right.map(b => ({
    tokens: new Set([...a.tokens, ...b.tokens]),
    references: new Set([...a.references, ...b.references]),
  })))
}

function parseExpression(value: string) {
  const source = ts.createSourceFile('class-expression.js', `(${value})`, ts.ScriptTarget.Latest, false, ts.ScriptKind.JS)
  const diagnostics = (source as ts.SourceFile & { parseDiagnostics: readonly ts.Diagnostic[] }).parseDiagnostics
  const statement = source.statements[0]
  return diagnostics.length === 0 && source.statements.length === 1 && statement && ts.isExpressionStatement(statement)
    ? statement.expression
    : undefined
}

function readAlternatives(node: ts.Expression): ClassAlternative[] | undefined {
  if (ts.isParenthesizedExpression(node)) {
    return readAlternatives(node.expression)
  }
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return [{ tokens: splitClassTokens(node.text), references: new Set() }]
  }
  if (ts.isIdentifier(node)) {
    return [{ tokens: new Set(), references: new Set([node.text]) }]
  }
  if (ts.isConditionalExpression(node)) {
    if (node.condition.kind === ts.SyntaxKind.TrueKeyword || node.condition.kind === ts.SyntaxKind.FalseKeyword) {
      return readAlternatives(node.condition.kind === ts.SyntaxKind.TrueKeyword ? node.whenTrue : node.whenFalse)
    }
    const yes = readAlternatives(node.whenTrue)
    const no = readAlternatives(node.whenFalse)
    return yes && no && yes.length + no.length <= 128 ? [...yes, ...no] : undefined
  }
  if (ts.isArrayLiteralExpression(node)) {
    let result = [empty()]
    for (const element of node.elements) {
      const alternatives = readAlternatives(element)
      const combined = alternatives && combine(result, alternatives)
      if (!combined) {
        return undefined
      }
      result = combined
    }
    return result
  }
  return undefined
}

/** 由完整表达式语法确认插值闭合，字符串、注释、正则和嵌套括号内的 }} 不能截断表达式。 */
function readInterpolation(value: string, start: number) {
  let end = value.indexOf('}}', start + 2)
  while (end >= 0) {
    const expression = parseExpression(value.slice(start + 2, end))
    if (expression) {
      return { expression, end: end + 2 }
    }
    end = value.indexOf('}}', end + 1)
  }
  return undefined
}

/** 静态片段只保留被真实空白或属性边界包围的完整 token，动态相邻碎片不参与证明。 */
export function parseTemplateClassValue(value: string): ClassAlternative[] | undefined {
  let alternatives = [empty()]
  let cursor = 0
  while (cursor < value.length) {
    const start = value.indexOf('{{', cursor)
    const staticEnd = start < 0 ? value.length : start
    const text = value.slice(cursor, staticEnd)
    if (text.includes('}}')) {
      return undefined
    }
    const tokens = new Set<string>()
    for (const match of text.matchAll(/\S+/g)) {
      const begin = cursor + match.index!
      const end = begin + match[0].length
      if ((begin === 0 || /\s/.test(value[begin - 1]!)) && (end === value.length || /\s/.test(value[end]!))) {
        tokens.add(match[0])
      }
    }
    alternatives = alternatives.map(item => ({ ...item, tokens: new Set([...item.tokens, ...tokens]) }))
    if (start < 0) {
      break
    }
    const interpolation = readInterpolation(value, start)
    if (!interpolation) {
      return undefined
    }
    const bounded = (start === 0 || /\s/.test(value[start - 1]!))
      && (interpolation.end === value.length || /\s/.test(value[interpolation.end]!))
    const branch = bounded ? readAlternatives(interpolation.expression) : undefined
    if (branch) {
      const combined = combine(alternatives, branch)
      if (!combined) {
        return undefined
      }
      alternatives = combined
    }
    cursor = interpolation.end
  }
  return alternatives
}

/** 只使用该 subject 实际出现的全部分支共同拥有的 scope，保留证明方向。 */
export function guaranteedScopes(alternatives: ClassAlternative[], subject: string, kind: 'tokens' | 'references') {
  const relevant = alternatives.filter(item => item[kind].has(subject))
  return new Set([...(relevant[0]?.tokens ?? [])].filter(token => isScopeClass(token) && relevant.every(item => item.tokens.has(token))))
}

export function createOutputTokenGroups(alternatives: ClassAlternative[]): OutputTokenGroup[] {
  const tokens = new Set(alternatives.flatMap(item => [...item.tokens]))
  const scopesByToken = new Map([...tokens].map(token => [token, guaranteedScopes(alternatives, token, 'tokens')]))
  return alternatives.map(item => ({ tokens: item.tokens, scopesByToken }))
}
