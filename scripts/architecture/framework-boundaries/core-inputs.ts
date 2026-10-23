import type { Graph } from '../graph'
import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import { findPath } from '../graph'
import { inside } from '../workspace'
import { createFrameworkBoundaryEdges } from './edges'
import { defaultFrameworkBoundaryRegistration } from './ownership'
import { createRawTypeResolver } from './raw-types'

const frameworkProperties = new Set(['appType', 'uniAppX', 'uniUtsPlatform'])

export function auditCoreFrameworkInputs(root: string, graph: Graph): string[] {
  const source = path.join(root, 'packages', 'weapp-tailwindcss', 'src')
  const coreRoots = ['compiler', 'core', 'generation'].map(directory => path.join(source, directory))
  const asts = new Map([...graph.keys()].filter(file => inside(source, file)).map(file => [file, ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true)]))
  const types = createRawTypeResolver(source, graph, asts)
  const errors = new Set<string>()
  const reportedEdges = new Set<string>()
  const publicExports = new Map<string, Set<string>>()
  for (const edge of createFrameworkBoundaryEdges(root, defaultFrameworkBoundaryRegistration).filter(edge => edge.entryOnly)) {
    const targets = publicExports.get(edge.from) ?? new Set<string>()
    targets.add(edge.to)
    publicExports.set(edge.from, targets)
  }
  const forbidden = (file: string) => inside(path.join(source, 'context'), file)
    || inside(path.join(source, 'framework-policies'), file)
    || file === path.join(source, 'framework', 'catalog.ts')
    || ['index.ts', 'options.ts', 'context-options.ts'].some(name => file === path.join(source, 'generator', name))
    || inside(path.join(source, 'runtime-branch'), file)
    || (inside(path.join(root, 'packages', 'env', 'src'), file) && file !== path.join(root, 'packages', 'env', 'src', 'types.ts'))
  for (const [file, ast] of asts) {
    if (!coreRoots.some(directory => inside(directory, file))) {
      continue
    }
    const report = (node: ts.Node, detail: string) => errors.add(`核心内部读取框架配置：${path.relative(root, file)}:${ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1} ${detail}`)
    function visit(node: ts.Node) {
      if (ts.isTypeReferenceNode(node) && types.resolveName(file, node.typeName)) {
        report(node, node.typeName.getText(ast))
      }
      if (ts.isImportSpecifier(node) && types.resolve(file, node.name.text)) {
        report(node, node.name.text)
      }
      if (ts.isExportDeclaration(node)) {
        const target = node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)
          ? types.localTarget(file, node.moduleSpecifier.text)
          : undefined
        const compatible = target !== undefined && publicExports.get(file)?.has(target)
        if (!compatible && (node.exportClause && ts.isNamedExports(node.exportClause)
          ? node.exportClause.elements.some(element => types.resolve(file, element.name.text))
          : target !== undefined && types.exportsRaw(target))) {
          report(node, node.getText(ast))
        }
      }
      if (ts.isImportTypeNode(node) && types.resolveImportType(file, node)) {
        report(node, node.getText(ast))
      }
      if (ts.isPropertyAccessExpression(node) && frameworkProperties.has(node.name.text)) {
        report(node, node.name.text)
      }
      if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'process' && node.name.text === 'env') {
        report(node, 'process.env')
      }
      if (ts.isElementAccessExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'process'
        && node.argumentExpression && ts.isStringLiteralLike(node.argumentExpression) && node.argumentExpression.text === 'env') {
        report(node, 'process.env')
      }
      if (ts.isElementAccessExpression(node) && node.argumentExpression && ts.isStringLiteralLike(node.argumentExpression) && frameworkProperties.has(node.argumentExpression.text)) {
        report(node, node.argumentExpression.text)
      }
      if ((ts.isPropertySignature(node) || ts.isPropertyAssignment(node)) && (ts.isIdentifier(node.name) || ts.isStringLiteralLike(node.name)) && frameworkProperties.has(node.name.text)) {
        report(node, node.name.text)
      }
      if (ts.isBindingElement(node)) {
        const name = node.propertyName ?? node.name
        if ((ts.isIdentifier(name) || ts.isStringLiteralLike(name)) && frameworkProperties.has(name.text)) {
          report(node, name.text)
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(ast)
    const allowed = publicExports.get(file)
    const effectiveGraph = allowed ? new Map(graph).set(file, new Set([...graph.get(file) ?? []].filter(target => !allowed.has(target)))) : graph
    const chain = findPath(effectiveGraph, file, forbidden)
    if (chain) {
      const lastEdge = chain.slice(-2).join(' -> ')
      if (!reportedEdges.has(lastEdge)) {
        reportedEdges.add(lastEdge)
        errors.add(`核心内部引用兼容解析：${chain.map(item => path.relative(root, item)).join(' -> ')}`)
      }
    }
  }
  return [...errors]
}
