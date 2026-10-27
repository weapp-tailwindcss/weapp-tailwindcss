import ts from 'typescript'
import { diagnosticSymbol } from './constants.mjs'

const observer = `(globalThis as any)[Symbol.for(${JSON.stringify(diagnosticSymbol)})]`
const wrappers = new Set(['sync', 'async', 'observe'])
const notifications = new Set(['emit', 'source'])
const observerNotifications = new Set(['webpackCreated', 'webpackCompleted', 'compilation', 'registerStore'])

/** 无观察器时保留原表达式与原函数体；已注册但损坏的协议必须继续失败。 */
export function guardDiagnosticObserver(source, relative) {
  const ast = ts.createSourceFile(relative, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  function classify(node) {
    if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression)) {
      return undefined
    }
    const receiver = node.expression.expression
    const method = node.expression.name.text
    if (ts.isPropertyAccessExpression(receiver) && receiver.name.text === 'operations' && receiver.expression.getText(ast) === observer) {
      return { observer: receiver.expression, wrapper: wrappers.has(method), notification: notifications.has(method) }
    }
    if (receiver.getText(ast) === observer && observerNotifications.has(method)) {
      return { observer: receiver, notification: true }
    }
  }
  let guarded = 0
  const result = ts.transform(ast, [(context) => {
    const factory = context.factory
    const absent = value => factory.createBinaryExpression(value, ts.SyntaxKind.EqualsEqualsEqualsToken, factory.createVoidZero())
    const present = value => factory.createBinaryExpression(value, ts.SyntaxKind.ExclamationEqualsEqualsToken, factory.createVoidZero())
    function visit(node) {
      if (ts.isReturnStatement(node) && node.expression) {
        const target = classify(node.expression)
        const callback = target?.wrapper && node.expression.arguments[2]
        if (callback && ts.isArrowFunction(callback) && ts.isBlock(callback.body)) {
          guarded++
          const observed = ts.visitEachChild(node.expression, visit, context)
          // 直接执行函数体，不额外包 Promise；正常返回 undefined 也不能落入观察分支。
          const direct = factory.createBlock([...observed.arguments[2].body.statements, factory.createReturnStatement()], true)
          return [factory.createIfStatement(absent(target.observer), direct), factory.updateReturnStatement(node, observed)]
        }
      }
      if (ts.isExpressionStatement(node) && ts.isAwaitExpression(node.expression)) {
        const target = classify(node.expression.expression)
        if (target?.notification) {
          guarded++
          const call = ts.visitEachChild(node.expression.expression, visit, context)
          // 未注册观察器时不能因为 await undefined 增加微任务边界。
          return factory.createIfStatement(present(target.observer), factory.createBlock([
            factory.createExpressionStatement(factory.createAwaitExpression(call)),
          ], true))
        }
      }
      const target = classify(node)
      if (target?.wrapper || target?.notification) {
        guarded++
        const observed = ts.visitEachChild(node, visit, context)
        let direct = factory.createVoidZero()
        if (target.wrapper) {
          const callback = observed.arguments[2]
          if (!ts.isArrowFunction(callback) || ts.isBlock(callback.body)) {
            throw new Error(`诊断观察器调用缺少可直通的表达式：${relative}`)
          }
          direct = callback.body
        }
        return factory.createParenthesizedExpression(factory.createConditionalExpression(
          absent(target.observer),
          undefined,
          direct,
          undefined,
          observed,
        ))
      }
      return ts.visitEachChild(node, visit, context)
    }
    return root => ts.visitNode(root, visit)
  }])
  try {
    if (!guarded) {
      throw new Error(`诊断观察器惰性边界缺失：${relative}`)
    }
    return ts.createPrinter().printFile(result.transformed[0])
  }
  finally { result.dispose() }
}
