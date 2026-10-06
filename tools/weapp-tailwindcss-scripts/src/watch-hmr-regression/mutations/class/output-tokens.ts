import type { ClassAlternative, OutputTokenGroup } from './class-value'
import ts from 'typescript'
import { createOutputTokenGroups, guaranteedScopes, parseTemplateClassValue, splitClassTokens } from './class-value'
import { collectScriptConsumerScopes } from './script-consumers'

export { isSafeClass, isScopeClass, splitClassTokens } from './class-value'

export interface TemplateClassConsumer {
  alternatives: ClassAlternative[]
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

/** 读取 class 的完整消费分支，并保留模板局部绑定与模块边界。 */
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
      const alternatives = parseTemplateClassValue(value)
      if (alternatives) {
        // 循环变量及命名模板拥有局部数据，不能当作顶层 render 字段。
        const scopes = [...stack, frame]
        consumers.push({ alternatives: alternatives.map(item => ({
          ...item,
          references: new Set([...item.references].filter(reference => !scopes.some(scope => scope.opaque || scope.bindings.has(reference)))),
        })) })
      }
    }
    if (!tag[0].endsWith('/>')) {
      stack.push(frame)
    }
  }
  return stack.length === 0
    ? consumers.map(consumer => ({ alternatives: consumer.alternatives.map(item => ({ ...item, references: new Set([...item.references].filter(reference => !modules.has(reference))) })) }))
    : []
}

export function collectOutputTokenGroups(output: string, target: 'wxml' | 'js', wxml = '') {
  if (target === 'wxml') {
    return collectTemplateClassConsumers(output).flatMap(consumer => createOutputTokenGroups(consumer.alternatives))
  }
  const source = ts.createSourceFile('output.js', output, ts.ScriptTarget.Latest, false, ts.ScriptKind.JS)
  const consumerScopes = collectScriptConsumerScopes(source, collectTemplateClassConsumers(wxml).flatMap((consumer) => {
    const references = new Set(consumer.alternatives.flatMap(item => [...item.references]))
    return [...references].map(reference => ({
      scopes: guaranteedScopes(consumer.alternatives, reference, 'references'),
      references: new Set([reference]),
    }))
  }))
  const groups: OutputTokenGroup[] = []
  const visit = (node: ts.Node) => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      const tokens = splitClassTokens(node.text)
      groups.push(...createOutputTokenGroups([{ tokens, references: new Set() }]))
      for (const scopes of consumerScopes.get(node) ?? []) {
        groups.push(...createOutputTokenGroups([{ tokens: new Set([...tokens, ...scopes]), references: new Set() }]))
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return groups
}
