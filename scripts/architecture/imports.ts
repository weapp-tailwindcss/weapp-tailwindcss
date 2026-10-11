import ts from 'typescript'

export interface ImportEdge {
  specifier: string
  typeOnly: boolean
}

/** 读取源码依赖；类型边用于层级检查，值边用于循环检查。 */
export function readImports(file: string, source: string): ImportEdge[] {
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true)
  const edges: ImportEdge[] = []
  const scopes = new Map<ts.Node, Map<string, ts.Expression | undefined>>()
  function scope(node: ts.Node, blockScoped: boolean): ts.Node {
    if (ts.isSourceFile(node) || ts.isFunctionLike(node) || (blockScoped && (ts.isBlock(node) || ts.isCaseBlock(node)))) {
      return node
    }
    return scope(node.parent, blockScoped)
  }
  function bind(name: ts.BindingName, owner: ts.Node, value?: ts.Expression) {
    const bindings = scopes.get(owner) ?? new Map<string, ts.Expression | undefined>()
    scopes.set(owner, bindings)
    if (ts.isIdentifier(name)) {
      bindings.set(name.text, value)
    }
    else {
      for (const element of name.elements) {
        if (ts.isBindingElement(element)) {
          bind(element.name, owner)
        }
      }
    }
  }
  function collect(node: ts.Node) {
    if (ts.isVariableDeclarationList(node)) {
      for (const declaration of node.declarations) {
        bind(declaration.name, scope(node.parent, Boolean(node.flags & ts.NodeFlags.BlockScoped)), node.flags & ts.NodeFlags.Const ? declaration.initializer : undefined)
      }
    }
    else if (ts.isParameter(node)) {
      bind(node.name, scope(node.parent, false))
    }
    ts.forEachChild(node, collect)
  }
  collect(ast)
  function staticString(node: ts.Node | undefined, visited = new Set<ts.Node>()): string | undefined {
    if (!node) {
      return undefined
    }
    if (ts.isStringLiteralLike(node)) {
      return node.text
    }
    if (ts.isParenthesizedExpression(node)) {
      return staticString(node.expression, visited)
    }
    if (ts.isIdentifier(node)) {
      for (let current: ts.Node | undefined = node.parent; current; current = current.parent) {
        const bindings = scopes.get(current)
        if (!bindings?.has(node.text)) {
          continue
        }
        const value = bindings.get(node.text)
        if (!value || visited.has(value)) {
          return undefined
        }
        visited.add(value)
        return staticString(value, visited)
      }
    }
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
      const left = staticString(node.left, new Set(visited))
      const right = staticString(node.right, new Set(visited))
      return left === undefined || right === undefined ? undefined : left + right
    }
    if (ts.isTemplateExpression(node)) {
      let result = node.head.text
      for (const span of node.templateSpans) {
        const value = staticString(span.expression, new Set(visited))
        if (value === undefined) {
          return undefined
        }
        result += value + span.literal.text
      }
      return result
    }
  }
  function add(node: ts.Node | undefined, typeOnly = false) {
    const specifier = staticString(node)
    if (specifier !== undefined) {
      edges.push({ specifier, typeOnly })
    }
  }
  function visit(node: ts.Node) {
    if (ts.isImportDeclaration(node)) {
      const clause = node.importClause
      const bindings = clause?.namedBindings
      add(node.moduleSpecifier, Boolean(clause?.isTypeOnly || (clause && !clause.name && bindings && ts.isNamedImports(bindings) && bindings.elements.length > 0 && bindings.elements.every(item => item.isTypeOnly))))
    }
    else if (ts.isExportDeclaration(node)) {
      const clause = node.exportClause
      add(node.moduleSpecifier, Boolean(node.isTypeOnly || (clause && ts.isNamedExports(clause) && clause.elements.length > 0 && clause.elements.every(item => item.isTypeOnly))))
    }
    else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
      add(node.moduleReference.expression, node.isTypeOnly)
    }
    else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
      add(node.argument.literal, true)
    }
    else if (ts.isCallExpression(node)) {
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword
        || (ts.isIdentifier(node.expression) && node.expression.text === 'require')) {
        add(node.arguments[0])
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(ast)
  return edges
}
