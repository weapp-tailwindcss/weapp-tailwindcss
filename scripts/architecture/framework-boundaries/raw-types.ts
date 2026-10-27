import type { Graph } from '../graph'
import path from 'node:path'
import ts from 'typescript'

const rawConfigurationTypes = new Set(['UserDefinedOptions', 'InternalUserDefinedOptions', 'AppType', 'FrameworkName', 'FrameworkPolicyInput', 'FrameworkEnvironment'])

function entityParts(name: ts.EntityName): string[] {
  return ts.isIdentifier(name) ? [name.text] : [...entityParts(name.left), name.right.text]
}

/** 追踪命名空间、类型包装和聚合导出；别名不改变输入的所有权。 */
export function createRawTypeResolver(
  source: string,
  graph: Graph,
  asts: Map<string, ts.SourceFile>,
  forbiddenTypes: ReadonlySet<string> = rawConfigurationTypes,
  forbiddenExportModules: ReadonlySet<string> = new Set(),
) {
  const localTarget = (file: string, specifier: string) => {
    const base = specifier.startsWith('@/')
      ? path.resolve(source, specifier.slice(2))
      : specifier.startsWith('.') ? path.resolve(path.dirname(file), specifier) : undefined
    if (!base) {
      return undefined
    }
    const withoutExtension = base.replace(/\.[cm]?jsx?$/, '')
    const extensions = ['.ts', '.mts', '.cts', '.tsx', '.js', '.mjs', '.cjs', '.jsx']
    return [base, ...extensions.map(extension => `${withoutExtension}${extension}`), ...extensions.map(extension => path.join(base, `index${extension}`))].find(candidate => graph.has(candidate))
  }
  const cache = new Map<string, boolean>()
  let cyclicReads = 0
  function resolvePath(file: string, names: readonly string[], visited = new Set<string>()): boolean {
    if (names.length === 1 && forbiddenTypes.has(names[0]!)) {
      return true
    }
    const key = `${file}:${names.join('.')}`
    if (visited.has(key)) {
      cyclicReads++
      return false
    }
    if (cache.has(key)) {
      return cache.get(key)!
    }
    const cyclicReadsBefore = cyclicReads
    const next = new Set(visited).add(key)
    const ast = asts.get(file)
    if (!ast) {
      return false
    }
    const [name, ...members] = names
    const referencesRaw = (node: ts.Node): boolean => {
      if (ts.isTypeReferenceNode(node) && resolvePath(file, entityParts(node.typeName), next)) {
        return true
      }
      if (ts.isExpressionWithTypeArguments(node)) {
        const parts = (value: ts.Expression): string[] => ts.isIdentifier(value)
          ? [value.text]
          : ts.isPropertyAccessExpression(value) ? [...parts(value.expression), value.name.text] : []
        if (resolvePath(file, parts(node.expression), next)) {
          return true
        }
      }
      if (ts.isImportTypeNode(node) && resolveImportType(file, node, next)) {
        return true
      }
      return ts.forEachChild(node, child => referencesRaw(child) || undefined) === true
    }
    const found = ast.statements.some((statement) => {
      if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
        const bindings = statement.importClause?.namedBindings
        const target = localTarget(file, statement.moduleSpecifier.text)
        if (bindings && ts.isNamespaceImport(bindings) && bindings.name.text === name) {
          if (members.length === 0) {
            return target !== undefined ? exportsRaw(target, next) : forbiddenExportModules.has(statement.moduleSpecifier.text)
          }
          return target !== undefined ? resolvePath(target, members, next) : members.length === 1 && forbiddenTypes.has(members[0]!)
        }
        if (bindings && ts.isNamedImports(bindings)) {
          return bindings.elements.some(element => element.name.text === name
            && ((members.length === 0 && forbiddenTypes.has((element.propertyName ?? element.name).text))
              || (target !== undefined && resolvePath(target, [(element.propertyName ?? element.name).text, ...members], next))))
        }
      }
      if (ts.isExportDeclaration(statement)) {
        const target = statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier) ? localTarget(file, statement.moduleSpecifier.text) : file
        if (!statement.exportClause) {
          return target !== undefined && resolvePath(target, names, next)
        }
        if (ts.isNamespaceExport(statement.exportClause)) {
          if (statement.exportClause.name.text !== name) {
            return false
          }
          if (members.length === 0) {
            return target !== undefined
              ? exportsRaw(target, next)
              : statement.moduleSpecifier !== undefined && ts.isStringLiteral(statement.moduleSpecifier) && forbiddenExportModules.has(statement.moduleSpecifier.text)
          }
          return target !== undefined ? resolvePath(target, members, next) : members.length === 1 && forbiddenTypes.has(members[0]!)
        }
        if (ts.isNamedExports(statement.exportClause)) {
          return statement.exportClause.elements.some(element => element.name.text === name
            && (target !== undefined
              ? resolvePath(target, [(element.propertyName ?? element.name).text, ...members], next)
              : members.length === 0 && forbiddenTypes.has((element.propertyName ?? element.name).text)))
        }
      }
      if (members.length === 0 && (ts.isTypeAliasDeclaration(statement) || ts.isInterfaceDeclaration(statement)) && statement.name.text === name) {
        return referencesRaw(statement)
      }
      return false
    })
    // 循环分支的未命中依赖当前遍历路径，不能缓存为全局否定结论。
    if (found || cyclicReads === cyclicReadsBefore) {
      cache.set(key, found)
    }
    return found
  }
  function resolveImportType(file: string, node: ts.ImportTypeNode, visited?: Set<string>): boolean {
    if (!ts.isLiteralTypeNode(node.argument) || !ts.isStringLiteral(node.argument.literal) || !node.qualifier) {
      return false
    }
    const target = localTarget(file, node.argument.literal.text)
    const names = entityParts(node.qualifier)
    return (names.length === 1 && forbiddenTypes.has(names[0]!)) || (target !== undefined && resolvePath(target, names, visited))
  }
  function exportsRaw(file: string, visited = new Set<string>()): boolean {
    if (visited.has(file)) {
      cyclicReads++
      return false
    }
    const next = new Set(visited).add(file)
    return (asts.get(file)?.statements ?? []).some((statement) => {
      if (ts.isExportDeclaration(statement)) {
        if (statement.exportClause && ts.isNamedExports(statement.exportClause)) {
          return statement.exportClause.elements.some(element => resolvePath(file, [element.name.text], next))
        }
        const target = statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier) ? localTarget(file, statement.moduleSpecifier.text) : undefined
        return target !== undefined
          ? exportsRaw(target, next)
          : statement.moduleSpecifier !== undefined && ts.isStringLiteral(statement.moduleSpecifier) && forbiddenExportModules.has(statement.moduleSpecifier.text)
      }
      if ((ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement)) && statement.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)) {
        return resolvePath(file, [statement.name.text])
      }
      return false
    })
  }
  return {
    localTarget,
    resolve: (file: string, name: string) => resolvePath(file, [name]),
    resolveName: (file: string, name: ts.EntityName) => resolvePath(file, entityParts(name)),
    resolveImportType,
    exportsRaw,
  }
}
