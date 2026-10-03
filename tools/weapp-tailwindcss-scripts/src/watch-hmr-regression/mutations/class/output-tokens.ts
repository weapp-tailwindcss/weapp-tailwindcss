import ts from 'typescript'
import { collectScriptConsumerScopes } from './script-consumers'

export interface TemplateClassConsumer {
  tokens: Set<string>
  references: Set<string>
}

export function splitClassTokens(value: string) {
  return new Set(value.split(/\s+/).filter(Boolean))
}

export function isScopeClass(token: string) {
  return /^data-v-[\da-z]+$/i.test(token)
}

function readAttributes(tag: string) {
  const attributes = new Map<string, string>()
  for (const attribute of tag.matchAll(/\s([^\s=<>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
    if (attributes.has(attribute[1]!)) {
      return undefined
    }
    attributes.set(attribute[1]!, attribute[2] ?? attribute[3] ?? '')
  }
  return attributes
}

function parseClassExpression(value: string): TemplateClassConsumer | undefined {
  const source = ts.createSourceFile('class-expression.js', `(${value})`, ts.ScriptTarget.Latest, false, ts.ScriptKind.JS)
  const diagnostics = (source as ts.SourceFile & { parseDiagnostics: readonly ts.Diagnostic[] }).parseDiagnostics
  const statement = source.statements[0]
  if (diagnostics.length > 0 || source.statements.length !== 1 || !statement || !ts.isExpressionStatement(statement)) {
    return undefined
  }
  const consumer: TemplateClassConsumer = { tokens: new Set(), references: new Set() }
  const visit = (node: ts.Expression): boolean => {
    if (ts.isParenthesizedExpression(node)) {
      return visit(node.expression)
    }
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      splitClassTokens(node.text).forEach(token => consumer.tokens.add(token))
      return true
    }
    if (ts.isIdentifier(node)) {
      consumer.references.add(node.text)
      return true
    }
    return ts.isArrayLiteralExpression(node) && node.elements.every(visit)
  }
  return visit(statement.expression) ? consumer : undefined
}

/** 只读取 class 的完整词法 token；表达式仅证明无条件字符串、数组及直接绑定。 */
export function collectTemplateClassConsumers(output: string) {
  const consumers: TemplateClassConsumer[] = []
  const markup = output.replace(/<!--[\s\S]*?-->/g, '')
  const tags = [...markup.matchAll(/<\/?[a-z][^"'<>]*(?:(?:"[^"]*"|'[^']*')[^"'<>]*)*>/gi)]
  const modules = new Set<string>()
  const stack: { name: string, bindings: Set<string>, opaque: boolean }[] = []
  for (const tag of tags) {
    const name = /^<\/?([\w:-]+)/.exec(tag[0])?.[1]
    if (!name) {
      continue
    }
    if (stack.at(-1)?.name === 'wxs' && !(name === 'wxs' && tag[0].startsWith('</'))) {
      continue
    }
    if (tag[0].startsWith('</')) {
      if (stack.pop()?.name !== name) {
        return []
      }
      continue
    }
    const attributes = readAttributes(tag[0])
    const moduleName = name === 'wxs' ? attributes?.get('module') : undefined
    if (moduleName) {
      modules.add(moduleName)
    }
    const frame = { name, bindings: new Set<string>(), opaque: !attributes || (name === 'template' && attributes.has('name')) }
    for (const attribute of attributes?.keys() ?? []) {
      const loop = /^([\w-]+):for(?:-items)?$/.exec(attribute)
      if (!loop) {
        continue
      }
      for (const kind of ['item', 'index']) {
        const binding = attributes?.get(`${loop[1]}:for-${kind}`) ?? kind
        frame.bindings.add(binding)
        frame.opaque ||= !/^[$a-z_][$\w]*$/i.test(binding)
      }
    }
    const classValue = name === 'wxs' ? undefined : attributes?.get('class')
    if (classValue !== undefined) {
      const value = classValue
        .replaceAll('&quot;', '"')
        .replaceAll('&apos;', '\'')
        .replaceAll('&lt;', '<')
        .replaceAll('&gt;', '>')
        .replaceAll('&amp;', '&')
        .trim()
      const expression = /^\{\{([\s\S]*)\}\}$/.exec(value)
      const consumer = expression
        ? parseClassExpression(expression[1]!)
        : value.includes('{{') || value.includes('}}') ? undefined : { tokens: splitClassTokens(value), references: new Set<string>() }
      if (consumer) {
        // 循环变量及命名模板拥有局部数据，不能当作顶层 render 字段。
        const scopes = [...stack, frame]
        consumer.references = new Set([...consumer.references].filter(reference => !scopes.some(scope => scope.opaque || scope.bindings.has(reference))))
        consumers.push(consumer)
      }
    }
    if (!tag[0].endsWith('/>')) {
      stack.push(frame)
    }
  }
  return stack.length === 0
    ? consumers.map(consumer => ({ ...consumer, references: new Set([...consumer.references].filter(reference => !modules.has(reference))) }))
    : []
}

export function collectOutputTokenGroups(output: string, target: 'wxml' | 'js', wxml = '') {
  if (target === 'wxml') {
    return collectTemplateClassConsumers(output).map(consumer => consumer.tokens)
  }
  const source = ts.createSourceFile('output.js', output, ts.ScriptTarget.Latest, false, ts.ScriptKind.JS)
  const consumerScopes = collectScriptConsumerScopes(source, collectTemplateClassConsumers(wxml).map(consumer => ({
    scopes: new Set([...consumer.tokens].filter(isScopeClass)),
    references: consumer.references,
  })))
  const groups: Set<string>[] = []
  const visit = (node: ts.Node) => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      const tokens = splitClassTokens(node.text)
      groups.push(tokens)
      for (const scopes of consumerScopes.get(node) ?? []) {
        groups.push(new Set([...tokens, ...scopes]))
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return groups
}
