import ts from 'typescript'

interface ScopedConsumer {
  scopes: Set<string>
  references: Set<string>
}

function propertyName(node: ts.PropertyName) {
  return ts.isIdentifier(node) || ts.isStringLiteral(node) ? node.text : undefined
}

function objectMembers(node: ts.ObjectLiteralExpression) {
  const members = new Map<string, ts.ObjectLiteralElementLike>()
  for (const member of node.properties) {
    const name = member.name && propertyName(member.name)
    if (!name || members.has(name)) {
      return undefined
    }
    members.set(name, member)
  }
  return members
}

function returnedObject(body: ts.Block | undefined) {
  const statements = body?.statements.filter(statement => !(ts.isExpressionStatement(statement) && ts.isStringLiteral(statement.expression)))
  const statement = statements?.[0]
  if (statements?.length !== 1 || !statement || !ts.isReturnStatement(statement) || !statement.expression || !ts.isObjectLiteralExpression(statement.expression)) {
    return undefined
  }
  return objectMembers(statement.expression)
}

function helperCall(node: ts.Expression | undefined, name: string, vendor?: string): node is ts.CallExpression {
  return !!node && ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
    && !node.questionDotToken && !node.expression.questionDotToken
    && node.expression.name.text === name && ts.isIdentifier(node.expression.expression)
    && (vendor === undefined || node.expression.expression.text === vendor)
}

function getCompiledBindings(source: ts.SourceFile) {
  if ((source as ts.SourceFile & { parseDiagnostics: readonly ts.Diagnostic[] }).parseDiagnostics.length > 0) {
    return undefined
  }
  const variables = new Map<string, ts.Expression>()
  const functions = new Map<string, ts.FunctionDeclaration>()
  const names = new Set<string>()
  for (const statement of source.statements) {
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name) || !declaration.initializer) {
          continue
        }
        if (names.has(declaration.name.text)) {
          return undefined
        }
        names.add(declaration.name.text)
        if (statement.declarationList.flags & ts.NodeFlags.Const) {
          variables.set(declaration.name.text, declaration.initializer)
        }
      }
    }
    else if (ts.isFunctionDeclaration(statement) && statement.name) {
      if (names.has(statement.name.text)) {
        return undefined
      }
      names.add(statement.name.text)
      functions.set(statement.name.text, statement)
    }
  }
  const exports = [...variables.entries()].filter(([, node]) => helperCall(node, '_export_sfc'))
  const [exportName, exported] = exports[0] ?? []
  if (exports.length !== 1 || !exported || !helperCall(exported, '_export_sfc') || exported.arguments.length !== 2) {
    return undefined
  }
  const registrations = source.statements.filter(statement => ts.isExpressionStatement(statement)
    && (helperCall(statement.expression, 'createPage', 'wx') || helperCall(statement.expression, 'createComponent', 'wx')))
  const registration = registrations[0]
  if (registrations.length !== 1 || !registration || !ts.isExpressionStatement(registration) || !ts.isCallExpression(registration.expression)) {
    return undefined
  }
  const registered = registration.expression.arguments[0]
  if (registration.expression.arguments.length !== 1 || !registered || !ts.isIdentifier(registered) || registered.text !== exportName) {
    return undefined
  }
  const vendor = ((exported.expression as ts.PropertyAccessExpression).expression as ts.Identifier).text
  const [componentName, attachments] = exported.arguments
  if (!componentName || !ts.isIdentifier(componentName) || !attachments || !ts.isArrayLiteralExpression(attachments)) {
    return undefined
  }
  const attachmentNames = new Set<string>()
  for (const attachment of attachments.elements) {
    if (!ts.isArrayLiteralExpression(attachment) || attachment.elements.length !== 2 || !attachment.elements[0] || !ts.isStringLiteral(attachment.elements[0]) || attachmentNames.has(attachment.elements[0].text)) {
      return undefined
    }
    attachmentNames.add(attachment.elements[0].text)
  }
  if (attachmentNames.has('data')) {
    return undefined
  }
  const component = variables.get(componentName.text)
  if (!helperCall(component, 'defineComponent', vendor) || component.arguments.length !== 1) {
    return undefined
  }
  const options = component.arguments[0]
  const data = options && ts.isObjectLiteralExpression(options) ? objectMembers(options)?.get('data') : undefined
  if (!data || !ts.isMethodDeclaration(data) || data.parameters.length > 0 || data.asteriskToken || data.modifiers?.some(item => item.kind === ts.SyntaxKind.AsyncKeyword)) {
    return undefined
  }
  const dataMembers = returnedObject(data.body)
  const renderAttachments = attachments.elements.filter(node => ts.isArrayLiteralExpression(node)
    && node.elements[0] && ts.isStringLiteral(node.elements[0]) && node.elements[0].text === 'render')
  const attachment = renderAttachments[0]
  if (!dataMembers || renderAttachments.length !== 1 || !attachment || !ts.isArrayLiteralExpression(attachment) || attachment.elements.length !== 2) {
    return undefined
  }
  const renderName = attachment.elements[1]
  const render = renderName && ts.isIdentifier(renderName) ? functions.get(renderName.text) : undefined
  // 编译器 render 的第 5 个参数是组件 data；不按局部变量的拼写猜测来源。
  const dataParameter = render?.parameters[4]
  if (!render || !dataParameter || !ts.isIdentifier(dataParameter.name) || render.asteriskToken || render.modifiers?.some(item => item.kind === ts.SyntaxKind.AsyncKeyword)
    || render.parameters.some(parameter => !ts.isIdentifier(parameter.name) || parameter.initializer || parameter.dotDotDotToken)
    || new Set(render.parameters.map(parameter => parameter.name.getText(source))).size !== render.parameters.length) {
    return undefined
  }
  const renderMembers = returnedObject(render.body)
  return renderMembers ? { dataMembers, renderMembers, dataName: dataParameter.name.text, vendor } : undefined
}

/** 沿组件导出、render 字段和 data 属性关联 scope，不能跨消费者合并。 */
export function collectScriptConsumerScopes(source: ts.SourceFile, consumers: ScopedConsumer[]) {
  const result = new Map<ts.StringLiteralLike, Set<string>[]>()
  const bindings = getCompiledBindings(source)
  if (!bindings) {
    return result
  }
  for (const consumer of consumers) {
    const scopes = consumer.scopes
    if (scopes.size === 0) {
      continue
    }
    for (const reference of consumer.references) {
      const field = bindings.renderMembers.get(reference)
      if (!field || !ts.isPropertyAssignment(field) || !helperCall(field.initializer, 'n', bindings.vendor) || field.initializer.arguments.length !== 1) {
        continue
      }
      const value = field.initializer.arguments[0]
      if (!value || !ts.isPropertyAccessExpression(value) || !ts.isIdentifier(value.expression) || value.expression.text !== bindings.dataName) {
        continue
      }
      const property = bindings.dataMembers.get(value.name.text)
      if (!property || !ts.isPropertyAssignment(property) || (!ts.isStringLiteral(property.initializer) && !ts.isNoSubstitutionTemplateLiteral(property.initializer))) {
        continue
      }
      const groups = result.get(property.initializer) ?? []
      groups.push(scopes)
      result.set(property.initializer, groups)
    }
  }
  return result
}
