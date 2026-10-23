import type { Graph } from '../graph'
import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import { findPath } from '../graph'
import { inside } from '../workspace'
import { createFrameworkBoundaryEdges } from './edges'
import { defaultFrameworkBoundaryRegistration } from './ownership'

const rawConfigurationTypes = new Set(['UserDefinedOptions', 'InternalUserDefinedOptions', 'AppType', 'FrameworkName', 'FrameworkPolicyInput', 'FrameworkEnvironment'])
const frameworkProperties = new Set(['appType', 'uniAppX', 'uniUtsPlatform'])

/** 跟踪本地类型别名和聚合导出，避免仅重命名输入类型就绕过契约。 */
function createRawTypeResolver(source: string, graph: Graph, asts: Map<string, ts.SourceFile>) {
  const localTarget = (file: string, specifier: string) => {
    const base = specifier.startsWith('@/')
      ? path.resolve(source, specifier.slice(2))
      : specifier.startsWith('.') ? path.resolve(path.dirname(file), specifier) : undefined
    if (!base) {
      return undefined
    }
    const withoutExtension = base.replace(/\.[cm]?js$/, '')
    return [base, `${withoutExtension}.ts`, `${withoutExtension}.mts`, path.join(base, 'index.ts')].find(candidate => graph.has(candidate))
  }
  const cache = new Map<string, boolean>()
  function resolve(file: string, name: string, visited = new Set<string>()): boolean {
    if (rawConfigurationTypes.has(name)) {
      return true
    }
    const key = `${file}:${name}`
    if (visited.has(key)) {
      return false
    }
    if (cache.has(key)) {
      return cache.get(key)!
    }
    const next = new Set(visited).add(key)
    const ast = asts.get(file)
    if (!ast) {
      return false
    }
    const referencesRaw = (node: ts.Node): boolean => {
      if (ts.isTypeReferenceNode(node) && ts.isIdentifier(node.typeName) && resolve(file, node.typeName.text, next)) {
        return true
      }
      if (ts.isExpressionWithTypeArguments(node) && ts.isIdentifier(node.expression) && resolve(file, node.expression.text, next)) {
        return true
      }
      return ts.forEachChild(node, child => referencesRaw(child) || undefined) === true
    }
    const found = ast.statements.some((statement) => {
      if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
        const bindings = statement.importClause?.namedBindings
        const target = localTarget(file, statement.moduleSpecifier.text)
        if (bindings && ts.isNamedImports(bindings)) {
          return bindings.elements.some(element => element.name.text === name
            && (rawConfigurationTypes.has((element.propertyName ?? element.name).text)
              || (target !== undefined && resolve(target, (element.propertyName ?? element.name).text, next))))
        }
      }
      if (ts.isExportDeclaration(statement)) {
        const target = statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier) ? localTarget(file, statement.moduleSpecifier.text) : file
        if (!statement.exportClause) {
          return target !== undefined && resolve(target, name, next)
        }
        if (ts.isNamedExports(statement.exportClause)) {
          return statement.exportClause.elements.some(element => element.name.text === name && target !== undefined && resolve(target, (element.propertyName ?? element.name).text, next))
        }
      }
      if ((ts.isTypeAliasDeclaration(statement) || ts.isInterfaceDeclaration(statement)) && statement.name.text === name) {
        return referencesRaw(statement)
      }
      return false
    })
    if (found) {
      cache.set(key, true)
    }
    return found
  }
  function resolveName(file: string, name: ts.EntityName): boolean {
    if (ts.isIdentifier(name)) {
      return resolve(file, name.text)
    }
    if (!ts.isIdentifier(name.left)) {
      return false
    }
    const namespace = name.left.text
    for (const statement of asts.get(file)?.statements ?? []) {
      if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) {
        continue
      }
      const bindings = statement.importClause?.namedBindings
      if (bindings && ts.isNamespaceImport(bindings) && bindings.name.text === namespace) {
        const target = localTarget(file, statement.moduleSpecifier.text)
        return rawConfigurationTypes.has(name.right.text) || (target !== undefined && resolve(target, name.right.text))
      }
    }
    return false
  }
  return { resolve, resolveName }
}

export function auditCoreFrameworkInputs(root: string, graph: Graph): string[] {
  const source = path.join(root, 'packages', 'weapp-tailwindcss', 'src')
  const coreRoots = ['compiler', 'core', 'generation'].map(directory => path.join(source, directory))
  const asts = new Map([...graph.keys()].filter(file => inside(source, file)).map(file => [file, ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true)]))
  const types = createRawTypeResolver(source, graph, asts)
  const errors = new Set<string>()
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
      if (ts.isPropertySignature(node) && (ts.isIdentifier(node.name) || ts.isStringLiteralLike(node.name)) && frameworkProperties.has(node.name.text)) {
        report(node, node.name.text)
      }
      ts.forEachChild(node, visit)
    }
    visit(ast)
    const allowed = publicExports.get(file)
    const effectiveGraph = allowed ? new Map(graph).set(file, new Set([...graph.get(file) ?? []].filter(target => !allowed.has(target)))) : graph
    const chain = findPath(effectiveGraph, file, forbidden)
    if (chain) {
      errors.add(`核心内部引用兼容解析：${chain.map(item => path.relative(root, item)).join(' -> ')}`)
    }
  }
  return [...errors]
}
