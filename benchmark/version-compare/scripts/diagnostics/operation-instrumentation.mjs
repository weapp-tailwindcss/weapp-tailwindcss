import ts from 'typescript'
import { diagnosticSymbol } from './constants.mjs'
import { guardDiagnosticObserver } from './observer-guard.mjs'

const observer = `(globalThis as any)[Symbol.for(${JSON.stringify(diagnosticSymbol)})]`
const operations = `${observer}.operations`
const prefix = 'packages/weapp-tailwindcss/src/'
export const generationTargets = [
  ['generator', `${prefix}tailwindcss/v4-engine/generator/engine.ts`],
  ['raw-generation', `${prefix}tailwindcss/v4-engine/generator/raw-generation.ts`],
  ['native', `${prefix}tailwindcss/v4-engine/generator/native-session.ts`],
  ['engine', 'packages/engine/src/v4/generation-session.ts'],
  ['compile', 'packages/engine/src/v4/node-adapter.ts'],
  ['service', `${prefix}core/compiler/generator-service-pool.ts`],
]

/** 每个变体都验证实际 AST；可选能力只能整文件不存在，不能吞掉损坏锚点。 */
export function instrumentOperationSource(source, kind, relative) {
  const ast = ts.createSourceFile(relative, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  if (ast.parseDiagnostics.length || source.includes(diagnosticSymbol)) {
    throw new Error(`操作 诊断源码无法解析或已插桩：${relative}`)
  }
  const edits = []
  const anchors = []
  function all(scope, predicate) {
    const result = []
    function visit(node) {
      if (predicate(node)) {
        result.push(node)
      }
      ts.forEachChild(node, visit)
    }
    visit(scope)
    return result
  }
  function unique(scope, predicate, name) {
    const matches = all(scope, predicate)
    if (matches.length !== 1) {
      throw new Error(`操作 AST 锚点必须唯一：${relative} ${name} (${matches.length})`)
    }
    anchors.push({ name, line: ast.getLineAndCharacterOfPosition(matches[0].getStart(ast)).line + 1 })
    return matches[0]
  }
  const named = name => unique(ast, node => (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node)) && node.name?.getText(ast) === name, name)
  const call = (scope, name) => unique(scope, node => ts.isCallExpression(node) && node.expression.getText(ast) === name, name)
  const insert = (position, text) => edits.push({ start: position, end: position, text })
  function wrapCall(node, name, details, asynchronous = false) {
    edits.push({ start: node.getStart(ast), end: node.end, text: `${operations}.${asynchronous ? 'async' : 'sync'}(${JSON.stringify(name)}, ${details}, () => (${node.getText(ast)}))` })
  }
  function surround(fn, name, details, asynchronous = false) {
    if (!fn.body) {
      throw new Error(`操作 AST 函数缺少实现：${name}`)
    }
    insert(fn.body.getStart(ast) + 1, `\nreturn ${operations}.${asynchronous ? 'async' : 'observe'}(${JSON.stringify(name)}, ${details}, ${asynchronous ? 'async ' : ''}() => {\n`)
    insert(fn.body.end - 1, '\n});\n')
  }
  if (kind === 'webpack') {
    const fn = named('setupWebpackV5ProcessAssetsHook')
    const hook = call(fn, 'compiler.hooks.compilation.tap')
    const callback = hook.arguments[1]
    if (!ts.isArrowFunction(callback) || !ts.isBlock(callback.body)) {
      throw new Error('Webpack compilation 回调结构改变')
    }
    insert(callback.body.getStart(ast) + 1, `;\n${observer}.webpackCreated(compilation);\n`)
    const end = call(fn, 'finalizeWebpackProcessAssets')
    if (!ts.isAwaitExpression(end.parent) || !ts.isExpressionStatement(end.parent.parent)) {
      throw new Error('Webpack 完成锚点必须是独立 await')
    }
    const statement = end.parent.parent
    insert(statement.end, `;\nawait ${observer}.webpackCompleted(compilation, { sourceCandidates: webpackSourceCandidateSet ?? [], runtime: runtimeSet, transformRuntime: transformRuntimeSet, generatorRuntime: generatorRuntimeSet });\n`)
  }
  else if (kind === 'scan') {
    const fn = named('resolveScanFileSnapshot')
    const read = call(fn, 'readSourceCandidateFile')
    const declaration = read.parent.parent
    if (!ts.isVariableDeclaration(declaration) || declaration.name.getText(ast) !== 'source') {
      throw new Error('扫描源码读取锚点改变')
    }
    insert(declaration.parent.parent.end, `;\n${operations}.source(file, source);\n`)
    const signature = call(named('resolve'), 'createSourceCandidateScanSignature')
    const signatureDeclaration = signature.parent
    if (!ts.isVariableDeclaration(signatureDeclaration) || signatureDeclaration.name.getText(ast) !== 'nextSignature') {
      throw new Error('扫描签名锚点改变')
    }
    insert(signatureDeclaration.parent.parent.end, `;\n${operations}.emit('scan.signature', { signature: JSON.parse(nextSignature), root, outDir });\n`)
    const cache = call(named('resolve'), 'scans.get')
    wrapCall(cache, 'scan.lookup', '{ signatureHash: nextSignatureHash }')
  }
  else if (kind === 'generator') {
    const factory = named('createTailwindV4Engine')
    unique(factory, node => ts.isVariableDeclaration(node) && node.name.getText(ast) === 'engine' && ts.isObjectLiteralExpression(node.initializer), 'generator engine identity')
    unique(factory, node => ts.isVariableDeclaration(node) && node.name.getText(ast) === 'generationSessions' && ts.isNewExpression(node.initializer) && node.initializer.expression.getText(ast) === 'TailwindV4NativeSessionPool', 'generator native pool identity')
    surround(factory, 'generator.create', '{ source }')
    const identities = `engineId: ${operations}.identity(engine), poolId: ${operations}.identity(generationSessions)`
    surround(named('generate'), 'generator.generate', `{ ${identities}, source, options }`, true)
    const cached = unique(ast, node => ts.isVariableDeclaration(node)
      && node.name.getText(ast) === 'cached'
      && node.initializer?.getText(ast) === 'incrementalGenerateCache.get(cacheKey)', 'incremental cache lookup')
    insert(cached.parent.parent.end, `;${operations}.emit('generator.cache', { cacheHit: Boolean(cached), cacheKey });`)
    surround(named('dispose'), 'generator.dispose', `{ ${identities} }`)
  }
  else if (kind === 'raw-generation') {
    const fn = named('generateRawArtifact')
    const scan = call(fn, 'extractRawCandidates')
    wrapCall(scan, 'raw-generation.scan', '{ sources: resolvedScanSources, options: patchOptions }', true)
    const normalized = unique(fn, node => ts.isVariableDeclaration(node)
      && node.name.getText(ast) === 'normalizedCandidates'
      && node.initializer?.getText(ast).startsWith('normalizeTargetRpxLengthCandidates('), 'resolved candidates')
    insert(normalized.parent.parent.end, `;\n${operations}.emit('raw-generation.candidates', { resolvedScanSources, filesystemCandidates, resolvedCandidates, normalizedCandidates: normalizedCandidates.candidates });`)
  }
  else if (kind === 'native') {
    const fn = named('getSession')
    wrapCall(call(fn, 'this.createSession'), 'native.create', '{ poolId: ' + `${operations}.identity(this), target, sourceKey, source, preparation }`)
    const cachedReturn = unique(fn, node => ts.isReturnStatement(node) && node.expression?.getText(ast) === 'cached', 'cached return')
    if (!ts.isBlock(cachedReturn.parent)) {
      throw new Error('原生会话缓存返回必须处于显式语句块')
    }
    insert(cachedReturn.getStart(ast), `;${operations}.emit('native.reuse', { poolId: ${operations}.identity(this), sessionId: ${operations}.identity(cached.session), target, sourceKey });\n`)
    const release = call(named('disposeEntry'), 'entry.session.dispose')
    edits.push({ start: release.getStart(ast), end: release.end, text: `${operations}.observe('native.dispose', { poolId: ${operations}.identity(this), sessionId: ${operations}.identity(entry.session) }, () => (${release.getText(ast)}))` })
    wrapCall(call(named('generate'), 'entry.session.generate'), 'native.generate', '{ poolId: ' + `${operations}.identity(this), sessionId: ${operations}.identity(entry.session), target, sourceKey, source, request }`, true)
  }
  else if (kind === 'engine') {
    const constructor = unique(ast, ts.isConstructorDeclaration, 'engine constructor')
    insert(constructor.body.end - 1, `;\n${operations}.emit('engine.create', { sessionId: ${operations}.identity(this), source });\n`)
    surround(named('dispose'), 'engine.dispose', `{ sessionId: ${operations}.identity(this) }`)
    surround(named('invalidate'), 'engine.invalidate', `{ sessionId: ${operations}.identity(this), change }`)
    wrapCall(call(named('generateInternal'), 'runtime.compiled.build'), 'engine.build', `{ sessionId: ${operations}.identity(this), source, candidates: buildCandidates }`)
  }
  else if (kind === 'compile') {
    wrapCall(call(named('compileTailwindV4Source'), 'node.compile'), 'engine.compile', '{ source, css: prepared.css, base }', true)
  }
  else if (kind === 'service') {
    for (const [method, label] of [['matches', 'matches.key'], ['acquire', 'acquire.key']]) {
      const scope = named(method)
      const matches = all(scope, node => ts.isCallExpression(node) && node.expression.getText(ast) === 'createGeneratorServiceKey')
      const selected = method === 'acquire' ? matches.filter(node => node.arguments[1]?.getText(ast) === 'options') : matches
      if (selected.length !== 1) {
        throw new Error(`服务 key 锚点改变：${method}`)
      }
      wrapCall(selected[0], label, '{}')
    }
    const acquire = named('acquire')
    const requestKey = unique(acquire, node => ts.isCallExpression(node) && node.expression.getText(ast) === 'createGeneratorServiceKey' && node.arguments[1]?.getText(ast) === 'stableRequest', 'request key')
    wrapCall(requestKey, 'request.key', '{}')
    const snapshots = all(acquire, node => ts.isCallExpression(node) && node.expression.getText(ast) === 'snapshotConfiguration')
    if (snapshots.length !== 2 || snapshots[0].arguments[0]?.getText(ast) !== 'source') {
      throw new Error('服务快照锚点改变')
    }
    wrapCall(snapshots[0], 'acquire.sourceSnapshot', '{}')
    wrapCall(snapshots[1], 'request.snapshot', '{}')
    wrapCall(call(acquire, 'copyGeneratorServiceResult'), 'result.copy', '{}')
    wrapCall(call(acquire, 'this.available.get'), 'service.lookup', `{ ownerId: ${operations}.identity(this), key }`)
    wrapCall(call(acquire, 'this.createGenerator'), 'service.create', `{ ownerId: ${operations}.identity(this), key, source: stableSource }`)
    const leaseRegistration = call(acquire, 'this.leases.set')
    if (!ts.isExpressionStatement(leaseRegistration.parent) || leaseRegistration.arguments.map(argument => argument.getText(ast)).join(',') !== 'generator,lease') {
      throw new Error('服务租约登记锚点改变')
    }
    insert(leaseRegistration.parent.end, `;\n${operations}.emit('service.acquire', { ownerId: ${operations}.identity(this), serviceId: ${operations}.identity(entry), serviceGeneratorId: ${operations}.identity(entry.generator), leaseId: ${operations}.identity(lease), generatorId: ${operations}.identity(generator), key, references: entry.references });\n`)
    const matchesReturn = unique(named('matches'), node => ts.isReturnStatement(node) && Boolean(node.expression), 'matches result').expression
    insert(matchesReturn.getStart(ast), `${operations}.sync('service.matches', { ownerId: ${operations}.identity(this), serviceId: ${operations}.identity(lease?.entry), serviceGeneratorId: ${operations}.identity(lease?.entry.generator), leaseId: ${operations}.identity(lease), generatorId: ${operations}.identity(generator), key: lease?.entry.key }, () => (`)
    insert(matchesReturn.end, '))')
    for (const method of ['retire', 'closeEntry']) {
      surround(named(method), `service.${method}`, `{ ownerId: ${operations}.identity(this), serviceId: ${operations}.identity(entry), key: entry.key }`)
    }
    const release = named('release')
    const guard = release.body.statements[0]
    if (!ts.isIfStatement(guard) || guard.expression.getText(ast) !== 'lease.disposal' || all(guard, node => ts.isReturnStatement(node) && node.expression?.getText(ast) === 'lease.disposal').length !== 1) {
      throw new Error('服务幂等释放锚点改变')
    }
    // 重复 dispose 在既有 guard 返回同一 Promise，只记录一次实际释放转换。
    insert(guard.end, `\nreturn ${operations}.observe('service.release', { ownerId: ${operations}.identity(this), leaseId: ${operations}.identity(lease), serviceId: ${operations}.identity(lease.entry), serviceGeneratorId: ${operations}.identity(lease.entry.generator), key: lease.entry.key }, () => {\n`)
    insert(release.body.end - 1, '\n});\n')
    const disposal = call(named('closeEntry'), 'entry.generator.dispose')
    edits.push({ start: disposal.getStart(ast), end: disposal.end, text: `${operations}.observe('service.dispose', { ownerId: ${operations}.identity(this), serviceId: ${operations}.identity(entry), serviceGeneratorId: ${operations}.identity(entry.generator), key: entry.key, callable: typeof entry.generator.dispose === 'function' }, () => (${disposal.getText(ast)}))` })
  }
  else {
    throw new Error(`未知 操作 插桩能力：${kind}`)
  }
  edits.sort((a, b) => b.start - a.start || b.end - a.end)
  let previous = source.length
  for (const edit of edits) {
    if (edit.end > previous) {
      throw new Error(`操作 插桩锚点重叠：${relative}`)
    }
    source = source.slice(0, edit.start) + edit.text + source.slice(edit.end)
    previous = edit.start
  }
  source = guardDiagnosticObserver(source, relative)
  const output = ts.createSourceFile(relative, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  if (output.parseDiagnostics.length) {
    throw new Error(`操作 插桩后语法无效：${relative}`)
  }
  return { source, anchor: { kind, anchors } }
}
