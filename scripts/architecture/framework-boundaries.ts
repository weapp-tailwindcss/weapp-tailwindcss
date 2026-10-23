import type { FrameworkBoundaryRegistration } from './framework-boundaries/ownership'
import type { Graph } from './graph'
import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import { createFrameworkBoundaryEdges, formatFrameworkBoundaryEdges } from './framework-boundaries/edges'
import { auditFrameworkRegistration, defaultFrameworkBoundaryRegistration, resolveFrameworkOwnership } from './framework-boundaries/ownership'
import { auditViteFrameworkRuntimeInputs } from './framework-boundaries/runtime-inputs'
import { findPath } from './graph'
import { inside } from './workspace'

/** 字符串检查作为依赖与类型边界的补充，注册新框架不修改检查算法。 */
function frameworkSelectionLines(file: string, registration: FrameworkBoundaryRegistration): number[] {
  const frameworkNames = new Set(Object.entries(registration.frameworks).flatMap(([name, entry]) => [name, ...entry.aliases]))
  const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true)
  const lines = new Set<number>()
  const isFrameworkName = (node: ts.Node, discriminant?: ts.Node): boolean => {
    if (!ts.isStringLiteralLike(node) || !frameworkNames.has(node.text)) {
      return false
    }
    return !['native', 'generic'].includes(node.text)
      || (discriminant !== undefined && /(?:appType|framework|frameworkName)$/i.test(discriminant.getText(source)))
  }
  const comparison = new Set([ts.SyntaxKind.EqualsEqualsToken, ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken])
  function visit(node: ts.Node) {
    const comparesName = ts.isBinaryExpression(node) && comparison.has(node.operatorToken.kind)
      && (isFrameworkName(node.left, node.right) || isFrameworkName(node.right, node.left))
    const switchesName = ts.isCaseClause(node) && ts.isSwitchStatement(node.parent.parent)
      && isFrameworkName(node.expression, node.parent.parent.expression)
    const includesName = ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
      && node.expression.name.text === 'includes' && ts.isArrayLiteralExpression(node.expression.expression)
      && node.expression.expression.elements.some(element => isFrameworkName(element, node.arguments[0]))
    if (comparesName || switchesName || includesName) {
      lines.add(source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1)
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return [...lines]
}

/** 兼容旧测试入口；未知或冲突归属由完整审计单独报告。 */
export function frameworkOwner(source: string, file: string, paths: typeof path = path): string | undefined {
  return resolveFrameworkOwnership(source, file, paths).owner
}

export function auditFrameworkBoundariesDetailed(root: string, graph: Graph, registration = defaultFrameworkBoundaryRegistration) {
  const source = path.join(root, 'packages', 'weapp-tailwindcss', 'src')
  const injectorSource = path.join(root, 'packages', 'weapp-style-injector', 'src')
  const edges = createFrameworkBoundaryEdges(root, registration)
  const activeEdges = edges.filter(edge => graph.get(edge.from)?.has(edge.to))
  const compatibilityEdges = new Map<string, Set<string>>()
  const assemblyEdges = new Map<string, Set<string>>()
  for (const edge of edges) {
    const target = edge.kind === 'compatibility' && !edge.entryOnly ? compatibilityEdges : assemblyEdges
    const targets = target.get(edge.from) ?? new Set<string>()
    targets.add(edge.to)
    target.set(edge.from, targets)
  }
  const selectionEntries = new Set([
    ...assemblyEdges.keys(),
    ...edges.filter(edge => edge.selectsFramework).map(edge => edge.from),
    path.join(source, 'framework-policies', 'environment.ts'),
    path.join(source, 'framework', 'catalog.ts'),
  ])
  const implementationGraph: Graph = new Map([...graph].map(([file, targets]) => [file, new Set([...targets].filter(target => !compatibilityEdges.get(file)?.has(target)))]))
  const errors = [...auditFrameworkRegistration(registration), ...auditViteFrameworkRuntimeInputs(root, graph)]
  const reported = new Set<string>()
  const report = (label: string, chain: string[]) => {
    const key = `${label}:${chain.slice(-2).join(' -> ')}`
    if (!reported.has(key)) {
      reported.add(key)
      errors.push(`${label}：${chain.map(file => path.relative(root, file)).join(' -> ')}`)
    }
  }
  const ownership = new Map([...graph.keys()].map(file => [file, resolveFrameworkOwnership(source, file, path, registration)]))
  const ownerOf = (file: string) => ownership.get(file)?.owner
  const policyResolver = path.join(source, 'framework-policies', 'resolve.ts')
  for (const [file, targets] of graph) {
    if (targets.has(policyResolver) && !compatibilityEdges.get(file)?.has(policyResolver)) {
      report('框架策略解析入口越界', [file, policyResolver])
    }
  }
  for (const file of graph.keys()) {
    if (!inside(source, file) && !inside(injectorSource, file)) {
      continue
    }
    const ownershipResult = ownership.get(file)!
    if (ownershipResult.missing) {
      report('框架模块缺少归属', [file])
    }
    if (ownershipResult.conflicting) {
      report('框架模块归属冲突', [file])
    }
    const owner = ownershipResult.owner
    if (owner) {
      const family = registration.frameworks[owner]?.family
      const chain = findPath(implementationGraph, file, (target) => {
        const targetOwner = ownerOf(target)
        return targetOwner !== undefined && targetOwner !== owner && targetOwner !== family
      })
      if (chain) {
        report('框架横向依赖', chain)
      }
      continue
    }
    if (!selectionEntries.has(file)) {
      for (const line of frameworkSelectionLines(file, registration)) {
        errors.push(`共享实现选择框架：${path.relative(root, file)}:${line}`)
      }
    }
    // 组装只授权当前入口的指定边；共享消费者经该入口进入时仍遍历完整依赖闭包。
    const allowed = assemblyEdges.get(file)
    const searchGraph = allowed ? new Map(implementationGraph).set(file, new Set([...implementationGraph.get(file) ?? []].filter(target => !allowed.has(target)))) : implementationGraph
    const chain = findPath(searchGraph, file, target => ownerOf(target) !== undefined)
    if (chain) {
      report('共享实现引用框架', chain)
    }
  }
  return { errors, exceptions: formatFrameworkBoundaryEdges(root, activeEdges) }
}

export function auditFrameworkBoundaries(root: string, graph: Graph, registration?: FrameworkBoundaryRegistration): string[] {
  return auditFrameworkBoundariesDetailed(root, graph, registration).errors
}
