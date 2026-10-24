import ts from 'typescript'
import { diagnosticSymbol } from './constants.mjs'

const marker = '__weappTailDiagnosticToken'

/** 只对已验证的准备副本插桩；保留原 await、异常、返回及钩子顺序。 */
export function instrumentViteTailSource(source, kind, relative) {
  const observer = `${kind === 'css' ? '(globalThis as any)' : 'globalThis'}[Symbol.for(${JSON.stringify(diagnosticSymbol)})]?.viteTail`
  if (source.includes(marker)) {
    throw new Error(`拒绝重复尾部诊断插桩：${relative}`)
  }
  const ast = ts.createSourceFile(relative, source, ts.ScriptTarget.Latest, true, kind === 'css' ? ts.ScriptKind.TS : ts.ScriptKind.JS)
  if (ast.parseDiagnostics.length) {
    throw new Error(`尾部诊断 AST 无法解析：${relative}`)
  }
  const edits = []
  const anchors = []
  const find = (root, predicate) => {
    const matches = []
    const walk = (node) => {
      if (predicate(node)) {
        matches.push(node)
      }
      ts.forEachChild(node, walk)
    }
    walk(root)
    return matches
  }
  const unique = (nodes, name) => {
    if (nodes.length !== 1) {
      throw new Error(`尾部诊断锚点必须唯一：${relative}/${name}，实际 ${nodes.length}`)
    }
    return nodes[0]
  }
  const fn = name => unique(ast.statements.filter(node => ts.isFunctionDeclaration(node) && node.name?.text === name && node.body), name)
  const call = (node, text) => ts.isCallExpression(node) && node.expression.getText(ast) === text
  const method = (root, name) => unique(find(root, node => ts.isMethodDeclaration(node) && node.name?.getText(ast) === name && node.body), name)
  const wrap = (node, name, details = '{}', body = false) => {
    const start = body ? node.getStart(ast) + 1 : node.getStart(ast)
    const end = body ? node.end - 1 : node.end
    const original = source.slice(start, end)
    // 没有 observer 时走原始语句，没有回调、Promise、额外 await 或详情求值。
    // 产品已经抛错时，诊断失败只使证据无效，不能替换产品原始抛出值。
    const replacement = `if (${observer} === undefined) { ${original} } else { const ${marker} = ${observer}.begin(${JSON.stringify(name)}, ${details}); let __weappTailDiagnosticFailed = false; try { ${original} } catch (__weappTailDiagnosticError) { __weappTailDiagnosticFailed = true; try { ${observer}.failure(${marker}, __weappTailDiagnosticError); } catch { /* 诊断自身的故障已记录到 summary，保留产品异常。 */ } throw __weappTailDiagnosticError; } finally { if (__weappTailDiagnosticFailed) { try { ${observer}.end(${marker}, ${details}); } catch { /* 关闭观测不能覆盖产品异常。 */ } } else { ${observer}.end(${marker}, ${details}); } } }`
    edits.push({ start, end, replacement })
    anchors.push({ name, start, end })
  }
  if (kind === 'css') {
    const factory = fn('createViteCssFinalizerOutputPlugin')
    const handler = method(factory.body, 'handler')
    if (!handler.modifiers?.some(node => node.kind === ts.SyntaxKind.AsyncKeyword)
      || !handler.parameters.some(node => node.name.getText(ast) === 'bundle')) {
      throw new Error('CSS finalizer 异步钩子参数已改变')
    }
    wrap(handler.body, 'css-finalizer', '{ bundle }', true)
  }
  else if (kind === 'vite') {
    const build = fn('build')
    const configuration = unique(build.body.statements.filter(node => ts.isVariableStatement(node)
      && node.declarationList.declarations.some(declaration => declaration.name.getText(ast) === 'config'
        && declaration.initializer && ts.isAwaitExpression(declaration.initializer)
        && call(declaration.initializer.expression, 'resolveConfig'))), 'resolved-config')
    edits.push({ start: configuration.end, end: configuration.end, replacement: ` if (${observer} !== undefined) { ${observer}.configuration(config); } ` })
    anchors.push({ name: 'resolved-config', start: configuration.end, end: configuration.end })
    const reporter = fn('buildReporterPlugin')
    const writeBundle = method(reporter.body, 'writeBundle')
    if (writeBundle.parameters[1]?.name.getText(ast) !== 'output') {
      throw new Error('Vite reporter 输出参数已改变')
    }
    wrap(writeBundle.body, 'vite-reporter', '{ bundle: output }', true)
  }
  else if (kind === 'rollup') {
    const generateWrite = fn('handleGenerateWrite')
    const write = unique(find(generateWrite.body, node => ts.isExpressionStatement(node)
      && ts.isAwaitExpression(node.expression) && call(node.expression.expression, 'Promise.all')
      && find(node, child => call(child, 'writeOutputFile')).length === 1), 'write-files')
    wrap(write, 'rollup-write', '{ bundle: generated }')
    const writeBundle = unique(find(generateWrite.body, node => ts.isExpressionStatement(node)
      && ts.isAwaitExpression(node.expression) && call(node.expression.expression, 'outputPluginDriver.hookParallel')
      && node.expression.expression.arguments[0]?.text === 'writeBundle'), 'writeBundle')
    wrap(writeBundle, 'rollup-writeBundle', '{ bundle: generated }')
    const rollup = fn('rollupInternal')
    const result = unique(rollup.body.statements.flatMap(node => ts.isVariableStatement(node)
      ? [...node.declarationList.declarations].filter(declaration => declaration.name.getText(ast) === 'result'
        && declaration.initializer && ts.isObjectLiteralExpression(declaration.initializer))
      : []), 'rollup-result')
    const close = method(result.initializer, 'close')
    const closeBundle = unique(find(close.body, node => ts.isExpressionStatement(node)
      && ts.isAwaitExpression(node.expression) && call(node.expression.expression, 'graph.pluginDriver.hookParallel')
      && node.expression.expression.arguments[0]?.text === 'closeBundle'), 'closeBundle')
    wrap(closeBundle, 'rollup-close')
  }
  else {
    throw new Error(`未知尾部诊断目标：${kind}`)
  }
  let instrumented = source
  for (const edit of edits.sort((left, right) => right.start - left.start)) {
    instrumented = instrumented.slice(0, edit.start) + edit.replacement + instrumented.slice(edit.end)
  }
  return { source: instrumented, anchor: { kind, anchors } }
}
