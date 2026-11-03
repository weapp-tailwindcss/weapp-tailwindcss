import ts from 'typescript'
import { diagnosticSymbol } from './constants.mjs'
import { guardDiagnosticObserver } from './observer-guard.mjs'

const observer = `(globalThis as any)[Symbol.for(${JSON.stringify(diagnosticSymbol)})]`
const operations = `${observer}.operations`
const prefix = 'packages/weapp-tailwindcss/src/'
export const invalidationTargets = [
  ['watch-change', `${prefix}bundlers/vite/shared/framework-source-candidates-plugin.ts`],
  ['compiler-invalidation', `${prefix}core/compiler/compiler.ts`],
  ['root-invalidation', `${prefix}core/compiler/root-store.ts`],
  ['service-invalidation', `${prefix}core/compiler/generator-services.ts`],
]

/** 仅记录真实失效交接；不预消费 iterable，也不改动失效或租约策略。 */
export function instrumentInvalidationSource(source, kind, relative) {
  const ast = ts.createSourceFile(relative, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  if (ast.parseDiagnostics.length || source.includes(diagnosticSymbol)) {
    throw new Error(`失效诊断源码无法解析或已重复插桩：${relative}`)
  }
  const edits = []
  const anchors = []
  function unique(scope, predicate, name) {
    const matches = []
    function visit(node) {
      if (predicate(node)) matches.push(node)
      ts.forEachChild(node, visit)
    }
    visit(scope)
    if (matches.length !== 1) {
      throw new Error(`失效 AST 锚点必须唯一：${relative} ${name} (${matches.length})`)
    }
    const node = matches[0]
    anchors.push({ name, line: ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1 })
    return node
  }
  const named = name => unique(ast, node => (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node)) && node.name?.getText(ast) === name, name)
  const call = (scope, name) => unique(scope, node => ts.isCallExpression(node) && node.expression.getText(ast) === name, name)
  const insert = (position, text) => edits.push({ start: position, end: position, text })
  const emit = (position, name, details) => insert(position, `;${operations}.emit(${JSON.stringify(name)}, ${details});\n`)
  function wrap(node, name, details) {
    edits.push({ start: node.getStart(ast), end: node.end, text: `${operations}.sync(${JSON.stringify(name)}, ${details}, () => (${node.getText(ast)}))` })
  }
  if (kind === 'watch-change') {
    const fn = named('watchChange')
    if (!fn.body || fn.parameters.map(node => node.name.getText(ast)).join(',') !== 'id,change') {
      throw new Error('watchChange 参数锚点改变')
    }
    emit(fn.body.getStart(ast) + 1, 'vite.watchChange', '{ id, event: change.event }')
  }
  else if (kind === 'compiler-invalidation') {
    // ids 可能是单次迭代器；实际逐项内容由 root 汇总事件记录。
    wrap(call(named('invalidate'), 'rootStore.invalidate'), 'compiler.invalidate', `{ storeId: ${operations}.identity(rootStore) }`)
  }
  else if (kind === 'service-invalidation') {
    const node = call(named('createCompilerGeneratorServices'), 'pool.invalidate')
    if (node.arguments[0]?.getText(ast) !== 'entry.generator') throw new Error('服务失效参数锚点改变')
    wrap(node, 'compiler.service.invalidate', `{ poolId: ${operations}.identity(pool), rootId: entry.id, generatorId: ${operations}.identity(entry.generator), appliedEngineInvalidation: entry.appliedEngineInvalidation, engineInvalidation }`)
  }
  else if (kind === 'root-invalidation') {
    const fn = named('invalidate')
    const ending = unique(fn, ts.isReturnStatement, 'invalidate return')
    if (ending.expression?.getText(ast) !== 'Object.freeze([...affected].sort())') throw new Error('失效返回锚点改变')
    // 无观察器直接执行原函数体，只有观测分支分配本次调用的扁平记录。
    insert(fn.body.getStart(ast) + 1, `\nif (${observer} === undefined) { ${source.slice(fn.body.getStart(ast) + 1, fn.body.end - 1)} }\nconst diagnosticInvalidationTrace = { inputs: [] as string[], matches: [] as object[], revisions: [] as object[] };\n`)
    const loop = unique(fn, node => ts.isForOfStatement(node) && node.expression.getText(ast) === 'ids', 'ids loop')
    if (!ts.isBlock(loop.statement)) throw new Error('失效输入循环锚点改变')
    const identity = `storeId: ${operations}.identity(this)`
    insert(loop.statement.getStart(ast) + 1, ';diagnosticInvalidationTrace.inputs.push(id);\n')
    const root = unique(loop, node => ts.isIfStatement(node) && node.expression.getText(ast) === 'root?.accepting', 'root match')
    const dependency = unique(loop, node => ts.isForOfStatement(node) && node.expression.getText(ast) === 'this.dependencyRoots.get(id) ?? []', 'dependency match')
    const glob = unique(loop, node => ts.isIfStatement(node) && node.expression.getText(ast).includes('isFileMatchedByTailwindSourceEntries('), 'source match')
    for (const [node, rootId, reason] of [[root.thenStatement, 'root.id', 'root'], [dependency.statement, 'rootId', 'dependency'], [glob.thenStatement, 'sourceRoot.id', 'source']]) {
      if (!ts.isBlock(node)) throw new Error(`失效命中块锚点改变：${reason}`)
      insert(node.getStart(ast) + 1, `;diagnosticInvalidationTrace.matches.push({ id, rootId: ${rootId}, reason: ${JSON.stringify(reason)} });\n`)
    }
    const revision = unique(fn, node => ts.isIfStatement(node) && node.expression.getText(ast) === 'entry?.accepting', 'revision commit')
    if (!ts.isBlock(revision.thenStatement)) throw new Error('失效版本提交锚点改变')
    const values = '{ invalidation: entry.invalidation, engineInvalidation: entry.engineInvalidation }'
    insert(revision.thenStatement.getStart(ast) + 1, `\nconst diagnosticRootRevision = { rootId: entry.id, generatorId: ${operations}.identity(entry.generator), engine: engines.has(rootId), before: ${values}, after: undefined as { invalidation: number, engineInvalidation: number } | undefined };\ndiagnosticInvalidationTrace.revisions.push(diagnosticRootRevision);\n`)
    insert(revision.thenStatement.end - 1, `;diagnosticRootRevision.after = ${values};\n`)
    emit(ending.getStart(ast), 'compiler.root.invalidate', `{ ${identity}, ...diagnosticInvalidationTrace }`)
  }
  else {
    throw new Error(`未知失效插桩能力：${kind}`)
  }
  edits.sort((a, b) => b.start - a.start || b.end - a.end)
  let previous = source.length
  for (const edit of edits) {
    if (edit.end > previous) throw new Error(`失效插桩锚点重叠：${relative}`)
    source = source.slice(0, edit.start) + edit.text + source.slice(edit.end)
    previous = edit.start
  }
  return { source: guardDiagnosticObserver(source, relative), anchor: { kind: `invalidation-${kind}`, anchors } }
}
