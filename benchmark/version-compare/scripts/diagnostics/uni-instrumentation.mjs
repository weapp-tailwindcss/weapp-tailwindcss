import ts from 'typescript'
import { diagnosticSymbol } from './constants.mjs'

const prefix = 'packages/weapp-tailwindcss/src/bundlers/vite/generate-bundle/'
export const uniInputTargets = [
  ['runtime', `${prefix}runtime.ts`],
  ['css-plan', `${prefix}css-entry-processing.ts`],
  ['css-decision', `${prefix}css-entry-transform.ts`],
  ['css-schedule', `${prefix}transform-scheduling.ts`],
  ['js', `${prefix}js-processing.ts`],
  ['html', `${prefix}html-processing.ts`],
  ['js-asset', `${prefix}framework-js-asset-context.ts`],
  ['js-adapter', 'packages/weapp-tailwindcss/src/bundlers/vite/frameworks/uni-app-x/asset-pipeline.ts'],
]
const configurations = {
  runtime: ['generateBundle', ['processHtmlBundleEntry', 'processViteCssBundleEntry', 'processJsBundleEntry', 'replayCleanJsBundleEntry']],
  'css-plan': ['processViteCssBundleEntry', ['normalizeMiniProgramImportShell', 'normalizeRelativeCssConfigDirectives', 'prepareFrameworkRootStyle', 'resolveCssAssetOutputPlan', 'resolveViteCssSourcePlan', 'resolveViteCssCompositionPlan', 'processViteCssEntryTransform']],
  'css-decision': ['processViteCssEntryTransformNow', ['resolveViteCssTransformDecisionPlan', 'createScopedGeneratorSourceData', 'createScopedGeneratorCandidateSignatureForSources', 'createScopedGeneratorCandidateSignature', 'resolveViteCssTransformCachePlan', 'scheduleViteCssTransform']],
  'css-schedule': ['scheduleViteCssTransform', ['executeViteCssTransformTask', 'processViteCssCacheTask']],
  js: ['processJsBundleEntry', ['createLinkedImpactSignature', 'createJsHashSalt', 'getSnapshotHash', 'shouldSkipViteJsTransform', 'jsHandler', 'createFrameworkJsAssetContext', 'assetPipelineStrategy.createJsAssetTask']],
  html: ['processHtmlBundleEntry', ['templateHandler']],
  'js-asset': ['createFrameworkJsAssetContext', ['options.jsHandler', 'task.transform']],
  'js-adapter': ['createJsAssetTask', ['context.shouldSkipTransform', 'context.runCachedTransform', 'context.transformJs']],
}
const cacheCallbacks = { onCacheHit: 'local-hit', onSharedCacheHit: 'shared-attempt', onSharedResult: 'shared-result', transform: 'transform-entered' }
const planNames = new Set(['cssSourcePlan', 'cssCompositionPlan', 'cssTransformDecisionPlan', 'cssTransformCachePlan', 'hashSalt', 'processHash', 'htmlProcessHash', 'cachedHash'])
const uniText = `(globalThis as any)[Symbol.for(${JSON.stringify(diagnosticSymbol)})]?.uniInput`
function expression(text) {
  const node = ts.createSourceFile('observer.ts', `(${text})`, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS).statements[0].expression.expression
  function synthesize(item) {
    ts.setTextRange(item, { pos: -1, end: -1 })
    ts.forEachChild(item, synthesize)
  }
  synthesize(node)
  return node
}

/** 仅修改无 Git 的准备副本；匹配一次原调用，不重算条件、缓存或用户 matcher。 */
export function instrumentUniInputSource(source, kind, relative) {
  const config = configurations[kind]
  if (!config || source.includes(diagnosticSymbol)) throw new Error(`Uni 插桩目标未知或已重复：${relative}`)
  const ast = ts.createSourceFile(relative, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  if (ast.parseDiagnostics.length) throw new Error(`Uni AST 无法解析：${relative}`)
  const functions = []
  const calls = new Map(config[1].map(name => [name, []]))
  let snapshotAnchors = 0
  let cacheAnchors = 0
  const callbacks = new Map()
  function collect(node) {
    if ((ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node)) && node.name?.text === config[0]) functions.push(node)
    if (ts.isCallExpression(node) && calls.has(node.expression.getText(ast))) calls.get(node.expression.getText(ast)).push(node)
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'processFiles' && node.initializer?.getText(ast) === 'snapshot.processFiles') snapshotAnchors++
    if (ts.isMethodDeclaration(node) && Object.hasOwn(cacheCallbacks, node.name?.getText(ast))) {
      cacheAnchors++
      const name = node.name.getText(ast)
      callbacks.set(name, (callbacks.get(name) ?? 0) + 1)
    }
    ts.forEachChild(node, collect)
  }
  collect(ast)
  if (functions.length !== 1 || !functions[0].body) throw new Error(`Uni 函数锚点必须唯一：${relative} ${config[0]}`)
  for (const [name, matches] of calls) {
    const expected = kind === 'html' && name === 'templateHandler' ? 2 : kind === 'js' && ['createLinkedImpactSignature', 'createJsHashSalt'].includes(name) ? 2 : 1
    if (matches.length !== expected) throw new Error(`Uni 调用锚点数量改变：${relative} ${name} (${matches.length}/${expected})`)
  }
  if (kind === 'runtime' && (!ts.isIfStatement(functions[0].body.statements[0]) || functions[0].body.statements[0].expression.getText(ast) !== 'context.shouldProcessBundle?.() === false')) throw new Error('Uni 原始 shouldProcessBundle 早退锚点改变')
  if (kind === 'runtime' && snapshotAnchors !== 1) throw new Error('Uni snapshot 选择锚点必须唯一')
  const expectedCallbacks = kind === 'css-schedule' ? ['onCacheHit', 'onSharedCacheHit', 'onSharedResult'] : ['js', 'html', 'js-asset'].includes(kind) ? ['onCacheHit', 'transform'] : []
  for (const name of expectedCallbacks) if (callbacks.get(name) !== 1) throw new Error(`Uni cache 回调锚点必须唯一：${relative} ${name}`)
  const anchors = [...calls].map(([name, matches]) => ({ name, lines: matches.map(node => ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1) }))
  let transformed
  const result = ts.transform(ast, [(context) => {
    const f = context.factory
    const uni = () => expression(uniText)
    const present = () => f.createBinaryExpression(uni(), ts.SyntaxKind.ExclamationEqualsEqualsToken, f.createVoidZero())
    const fileText = kind === 'runtime' ? 'file' : kind === 'js' ? 'options.entry.file' : kind === 'js-adapter' ? 'context.file' : 'options.file'
    const details = extra => expression(`({ file: ${fileText}, sourceModule: ${JSON.stringify(relative)}, ${extra} })`)
    const call = (method, args) => f.createCallExpression(f.createPropertyAccessExpression(uni(), method), undefined, args)
    const notify = (name, data) => f.createIfStatement(present(), f.createExpressionStatement(call('note', [f.createStringLiteral(name), data])))
    function reasons(node) {
      const result = []
      for (let child = node, parent = node.parent; parent && !ts.isFunctionLike(parent); child = parent, parent = parent.parent) {
        if (ts.isIfStatement(parent)) result.push({ expression: parent.expression.getText(ast), outcome: parent.thenStatement === child })
      }
      return result.reverse()
    }
    function visit(node) {
      const original = node
      if (kind === 'js-adapter') {
        let scope = node
        while (scope && scope !== functions[0]) scope = scope.parent
        if (!scope && node !== ast) return ts.visitEachChild(node, visit, context)
      }
      node = ts.visitEachChild(node, visit, context)
      if (ts.isCallExpression(original) && calls.has(original.expression.getText(ast))) {
        const name = original.expression.getText(ast)
        const asynchronous = ts.isAwaitExpression(original.parent)
        return f.createParenthesizedExpression(f.createConditionalExpression(
          f.createBinaryExpression(uni(), ts.SyntaxKind.EqualsEqualsEqualsToken, f.createVoidZero()), undefined, node, undefined,
          call(asynchronous ? 'async' : name === 'options.jsHandler' ? 'observe' : 'sync', [f.createStringLiteral(`phase.${kind}.${name}`), details(''), f.createArrowFunction(undefined, undefined, [], undefined, f.createToken(ts.SyntaxKind.EqualsGreaterThanToken), node)]),
        ))
      }
      if (ts.isExpressionStatement(original) && ts.isCallExpression(original.expression)) {
        const target = original.expression.expression.getText(ast)
        const message = original.expression.arguments[0]
        if (['debug', 'options.debug'].includes(target) && message && ts.isStringLiteral(message) && kind !== 'runtime') {
          const text = message.text
          const state = text.startsWith('js direct replay hit') ? 'direct-replay-hit' : text.startsWith('css replay last result') ? 'last-result-hit' : text.startsWith('css skip vite-processed asset') ? 'processed-reuse' : undefined
          return f.createBlock([notify(state ? 'cache' : 'decision', details(`message: ${JSON.stringify(text)}, ${state ? `state: ${JSON.stringify(state)},` : ''} conditions: ${JSON.stringify(reasons(original))}`)), node], true)
        }
      }
      let inAdapter = kind !== 'js-adapter'
      for (let scope = original; scope && !inAdapter; scope = scope.parent) if (scope === functions[0]) inAdapter = true
      if (!inAdapter) return node
      if ((ts.isReturnStatement(original) && kind !== 'runtime') || (ts.isContinueStatement(original) && kind === 'runtime')) {
        const cancelled = ts.isReturnStatement(original) && reasons(original).some(item => item.expression === '!options.isSourceCurrent()' && item.outcome)
        return f.createBlock([...(cancelled ? [notify('cache', details('state: "cancelled", reason: "source-not-current"'))] : []), notify('selection', details(`action: ${JSON.stringify(ts.isContinueStatement(original) ? 'continue' : 'return')}, conditions: ${JSON.stringify(reasons(original))}`)), node], true)
      }
      if (kind === 'css-schedule' && ts.isCatchClause(original)) {
        const guards = original.block.statements.filter(item => ts.isIfStatement(item) && item.expression.getText(ast) === 'error !== discardedViteCssSource')
        if (guards.length !== 1) throw new Error('Uni CSS 撤销捕获锚点改变')
        return f.updateCatchClause(node, node.variableDeclaration, f.updateBlock(node.block, [...node.block.statements, notify('cache', details('state: "cancelled", reason: "discarded-vite-css-source"'))]))
      }
      if (kind !== 'js-adapter' && ts.isMethodDeclaration(original) && Object.hasOwn(cacheCallbacks, original.name?.getText(ast)) && node.body) {
        node = f.updateMethodDeclaration(node, node.modifiers, node.asteriskToken, node.name, node.questionToken, node.typeParameters, node.parameters, node.type, f.updateBlock(node.body, [notify('cache', details(`state: ${JSON.stringify(cacheCallbacks[original.name.getText(ast)])}`)), ...node.body.statements]))
      }
      if (ts.isVariableDeclaration(original) && original.name.getText(ast) === 'runTransform' && ts.isArrowFunction(node.initializer) && ts.isBlock(node.initializer.body)) {
        const fn = node.initializer
        node = f.updateVariableDeclaration(node, node.name, node.exclamationToken, node.type, f.updateArrowFunction(fn, fn.modifiers, fn.typeParameters, fn.parameters, fn.type, fn.equalsGreaterThanToken, f.updateBlock(fn.body, [notify('cache', details('state: "transform-entered"')), ...fn.body.statements])))
      }
      if (ts.isVariableStatement(original)) {
        const declarations = original.declarationList.declarations
        if (kind === 'runtime' && declarations.some(item => item.name.getText(ast) === 'processFiles' && item.initializer?.getText(ast) === 'snapshot.processFiles')) {
          return [node, f.createIfStatement(present(), f.createExpressionStatement(call('snapshot', [f.createIdentifier('snapshot'), expression('({ useIncrementalMode, processMarkupAndScripts, processStyles, iteration: state.iteration + 1 })')]))) ]
        }
        const plans = declarations.filter(item => planNames.has(item.name.getText(ast)))
        if (plans.length) return [node, ...plans.map(item => notify('plan', details(`name: ${JSON.stringify(item.name.getText(ast))}, plan: ${item.name.getText(ast)}`)))]
      }
      if (original === functions[0] && kind === 'runtime') {
        const [skipGuard, ...statements] = node.body.statements
        const body = f.createBlock([f.createExpressionStatement(call('rawBundle', [f.createIdentifier('bundle')])), ...statements], true)
        const observed = f.createReturnStatement(call('bundle', [f.createArrowFunction([f.createModifier(ts.SyntaxKind.AsyncKeyword)], undefined, [], undefined, f.createToken(ts.SyntaxKind.EqualsGreaterThanToken), body)]))
        return f.updateFunctionExpression(node, node.modifiers, node.asteriskToken, node.name, node.typeParameters, node.parameters, node.type, f.createBlock([skipGuard, f.createIfStatement(present(), observed), ...statements], true))
      }
      if (original === functions[0] && kind !== 'runtime') {
        const body = f.updateBlock(node.body, [notify('layer', details(`layer: ${JSON.stringify(kind)}`)), ...node.body.statements])
        return f.updateFunctionDeclaration(node, node.modifiers, node.asteriskToken, node.name, node.typeParameters, node.parameters, node.type, body)
      }
      return node
    }
    return root => ts.visitNode(root, visit)
  }])
  try { transformed = ts.createPrinter().printFile(result.transformed[0]) }
  finally { result.dispose() }
  const diagnostics = ts.createSourceFile(relative, transformed, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS).parseDiagnostics
  if (diagnostics.length) throw new Error(`Uni 插桩后语法错误：${relative} ${diagnostics.map(item => `${item.start}: ${ts.flattenDiagnosticMessageText(item.messageText, ' ')}`).join('; ')}`)
  return { source: transformed, anchor: { kind: `uni-${kind}`, anchors, snapshotAnchors, cacheAnchors } }
}
