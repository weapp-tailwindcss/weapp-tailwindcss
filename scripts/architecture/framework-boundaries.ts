import type { Graph } from './graph'
import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import { findPath } from './graph'
import { inside } from './workspace'

const frameworks = new Set(['generic', 'native', 'taro', 'uni-app', 'uni-app-x', 'mpx', 'weapp-vite'])
const frameworkNames = new Set([...frameworks, 'uni-app-vite'])

/** 检查实际分派表达式，避免注释、类型声明或普通配置值触发误报。 */
function frameworkSelectionLines(file: string): number[] {
  const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true)
  const lines = new Set<number>()
  const isFrameworkName = (node: ts.Node, discriminant?: ts.Node): boolean => {
    if (!ts.isStringLiteralLike(node) || !frameworkNames.has(node.text)) {
      return false
    }
    // native/generic 也用于编译后端等领域，只在框架标识上将其视为分派。
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

/** 只按文件系统目录归属分类，不把 module id 或 URL 当作文件路径。 */
export function frameworkOwner(source: string, file: string, paths: typeof path = path): string | undefined {
  const injectorSource = paths.resolve(source, '..', '..', 'weapp-style-injector', 'src')
  const injectorParts = paths.relative(injectorSource, file).split(paths.sep)
  if (injectorParts.length === 2 && ['vite', 'webpack'].includes(injectorParts[0]!)) {
    const name = injectorParts[1]?.replace(/\.[cm]?[jt]s$/, '')
    if (name === 'uni-app') {
      return 'uni'
    }
    if (name === 'taro' || name === 'mpx') {
      return name
    }
  }
  const relative = paths.relative(source, file)
  if (relative === '..' || relative.startsWith(`..${paths.sep}`) || paths.isAbsolute(relative)) {
    return undefined
  }
  const parts = relative.split(paths.sep)
  if (parts[0] === 'presets') {
    const name = parts[1]?.replace(/\.[cm]?[jt]s$/, '')
    if (name === 'hbuilderx') {
      return 'uni'
    }
    return name && frameworks.has(name) ? name : undefined
  }
  if (relative === paths.join('shared', 'mpx.ts') || relative === paths.join('shared', 'mpx-plugin-owner.ts')) {
    return 'mpx'
  }
  if (relative === paths.join('bundlers', 'vite', 'uni-app-x-css-options.ts')
    || relative === paths.join('bundlers', 'vite', 'generate-bundle', 'uni-app-x-postprocess.ts')) {
    return 'uni-app-x'
  }
  if (parts[0] === 'uni-app-x') {
    return 'uni-app-x'
  }
  if (parts[0] === 'bundlers' && parts[2] === 'frameworks' && frameworks.has(parts[3]!)) {
    return parts[3]
  }
  if (parts[0] === 'bundlers' && parts[2] === 'frameworks' && parts[3] === 'shared' && parts[4] === 'uni') {
    return 'uni'
  }
  if (parts[0] === 'framework-policies') {
    const name = parts[1]?.replace(/\.[cm]?[jt]s$/, '')
    return name && name !== 'generic' && frameworks.has(name) ? name : undefined
  }
  if (parts[0] === 'style-injector' && ['vite', 'webpack'].includes(parts[1]!)) {
    const name = parts[2]?.replace(/\.[cm]?[jt]s$/, '')
    if (name === 'uni') {
      return 'uni'
    }
    // generic 是无框架语义的底层工厂。
    return name && name !== 'generic' && frameworks.has(name) ? name : undefined
  }
  return undefined
}

/** 框架选择只属于明确的公开组装入口；兼容重导出仍在消费者的依赖闭包中检查。 */
export function auditFrameworkBoundaries(root: string, graph: Graph): string[] {
  const source = path.join(root, 'packages', 'weapp-tailwindcss', 'src')
  const at = (...segments: string[]) => path.join(source, ...segments)
  const policyResolver = at('framework-policies', 'resolve.ts')
  const policyEntries = new Set([
    at('context', 'index.ts'),
    at('generator', 'options.ts'),
    at('runtime-branch', 'index.ts'),
    at('runtime-branch', 'generator-target-env.ts'),
    at('runtime-branch', 'platform.ts'),
  ])
  const selector = at('bundlers', 'framework-selector.ts')
  const selectorOptions = at('uni-app-x', 'options.ts')
  const assemblyEntries = new Set([
    ...policyEntries,
    policyResolver,
    selector,
    at('bundlers', 'vite', 'index.ts'),
    at('bundlers', 'webpack', 'frameworks', 'index.ts'),
    at('bundlers', 'webpack', 'BaseUnifiedPlugin', 'v5.ts'),
    at('bundlers', 'webpack', 'index.ts'),
    at('bundlers', 'rspack', 'index.ts'),
    at('bundlers', 'gulp', 'index.ts'),
    ...['index', 'vite', 'webpack', 'rspack', 'gulp', 'presets'].map(name => at(`${name}.ts`)),
    at('vite-web.ts'),
    at('typedoc.export.ts'),
    at('style-injector', 'internal.ts'),
    at('presets', 'index.ts'),
  ])
  const selectionEntries = new Set([...assemblyEntries, at('framework-policies', 'environment.ts')])
  const errors: string[] = []
  const reported = new Set<string>()
  const report = (label: string, chain: string[]) => {
    const key = `${label}:${chain.slice(-2).join(' -> ')}`
    if (!reported.has(key)) {
      reported.add(key)
      errors.push(`${label}：${chain.map(file => path.relative(root, file)).join(' -> ')}`)
    }
  }

  // 兼容入口在调用核心前解析策略；除此以外，不允许任何 facade 扩大解析边界。
  for (const [file, targets] of graph) {
    if (targets.has(policyResolver) && !policyEntries.has(file)) {
      report('框架策略解析入口越界', [file, policyResolver])
    }
  }
  const implementationGraph: Graph = new Map([...graph].map(([file, targets]) => [
    file,
    new Set([...targets].filter(target => !(policyEntries.has(file) && target === policyResolver)
      && !(file === selector && target === selectorOptions))),
  ]))

  for (const file of graph.keys()) {
    if (!inside(source, file)) {
      continue
    }
    const owner = frameworkOwner(source, file)
    if (owner) {
      const chain = findPath(implementationGraph, file, (target) => {
        const targetOwner = frameworkOwner(source, target)
        const sharedFamily = targetOwner === 'uni' && (owner === 'uni-app' || owner === 'uni-app-x')
        return targetOwner !== undefined && targetOwner !== owner && !sharedFamily
      })
      if (chain) {
        report('框架横向依赖', chain)
      }
      continue
    }
    if (!selectionEntries.has(file)) {
      for (const line of frameworkSelectionLines(file)) {
        errors.push(`共享实现选择框架：${path.relative(root, file)}:${line}`)
      }
    }
    if (assemblyEntries.has(file)) {
      continue
    }
    const chain = findPath(implementationGraph, file, target => frameworkOwner(source, target) !== undefined)
    if (chain) {
      report('共享实现引用框架', chain)
    }
  }
  return errors
}
