import type { ClassOutputSnapshot } from '../class/evidence'
import ts from 'typescript'
import { createOutputTokenGroups } from '../class/class-value'
import { assertClassTokensInConsumers } from '../class/evidence'
import { collectOutputTokenGroups, splitClassTokens } from '../class/output-tokens'

function collectScriptClassGroups(output: string) {
  const source = ts.createSourceFile('iconify-output.js', output, ts.ScriptTarget.Latest, false, ts.ScriptKind.JS)
  if ((source as ts.SourceFile & { parseDiagnostics: readonly ts.Diagnostic[] }).parseDiagnostics.length > 0) {
    return []
  }
  const groups: Set<string>[] = []
  const visit = (node: ts.Node) => {
    if (ts.isObjectLiteralExpression(node) && !node.properties.some(property => ts.isSpreadAssignment(property)
      || (property.name && ts.isComputedPropertyName(property.name)))) {
      const properties = node.properties.filter(property => property.name
        && (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name))
        && ['class', 'className'].includes(property.name.text))
      const property = properties[0]
      // Taro React / Vue 的静态模板编译为 props 对象；不将未使用字符串、间接绑定或可被覆盖的属性当作消费。
      if (properties.length === 1 && property && ts.isPropertyAssignment(property)
        && (ts.isStringLiteral(property.initializer) || ts.isNoSubstitutionTemplateLiteral(property.initializer))) {
        groups.push(splitClassTokens(property.initializer.text))
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return groups
}

/** 同一 class 消费位置必须同时拥有本轮阶段身份及全部样式证据，不能跨节点拼接。 */
export function assertIconifyConsumer(
  outputs: ClassOutputSnapshot,
  targets: Array<'wxml' | 'js'>,
  marker: string,
  classTokens: string[],
  escapedClasses: string[],
  label: string,
) {
  if (targets.length === 0) {
    throw new Error(`${label}: no class output target configured`)
  }
  for (const target of targets) {
    const consumers = (target === 'js'
      ? collectScriptClassGroups(outputs.js).flatMap(tokens => createOutputTokenGroups([{ tokens, references: new Set() }]))
      : collectOutputTokenGroups(outputs.wxml, target))
      .filter(group => group.tokens.has(marker))
    let cause: unknown
    const matched = consumers.some((group) => {
      try {
        assertClassTokensInConsumers(outputs, classTokens, escapedClasses, [{ target, groups: [group] }], label)
        return true
      }
      catch (error) {
        cause = error
        return false
      }
    })
    if (!matched) {
      throw new Error(`${label}: ${target} missing current phase class consumer ${marker}`, { cause })
    }
  }
}
