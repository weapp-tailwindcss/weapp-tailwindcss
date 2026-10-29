import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import ts from 'typescript'
import { sha256 } from './identity.mjs'

const observer = '(globalThis as any)[Symbol.for("weapp-tailwindcss.source-ab.v1")]'
const base = 'packages/weapp-tailwindcss/src/bundlers/webpack/BaseUnifiedPlugin'

function unique(ast, predicate, label) {
  const nodes = []
  function visit(node) { if (predicate(node)) nodes.push(node); ts.forEachChild(node, visit) }
  visit(ast)
  assert.equal(nodes.length, 1, `诊断 AST 锚点必须唯一：${label}`)
  return nodes[0]
}

function statement(node) {
  while (node && !ts.isStatement(node)) node = node.parent
  assert.ok(node, '调用缺少 statement 边界')
  return node
}

export function instrumentSource(source, relative) {
  const ast = ts.createSourceFile(relative, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  assert.equal(ast.parseDiagnostics.length, 0, '原文必须可解析')
  assert.ok(!source.includes('weapp-tailwindcss.source-ab.v1'), '拒绝重复插桩')
  const edits = []
  const before = (node, value) => edits.push({ start: node.getStart(ast), end: node.getStart(ast), value: `;${value}` })
  const after = (node, value) => edits.push({ start: node.end, end: node.end, value: `;${value}` })
  const call = name => unique(ast, node => ts.isCallExpression(node) && node.expression.getText(ast) === name, name)
  if (relative.endsWith('v5-assets.ts')) {
    const sets = phase => `${observer}?.sets(${JSON.stringify(phase)}, { compilation, runtime: runtimeSet, transform: transformRuntimeSet, generator: generatorRuntimeSet, sourceCandidates: webpackSourceCandidateSet, sources: cssSources, loaders: generatedCssSources, grouped: groupedEntries });\n`
    before(statement(call('enqueueWebpackHtmlAndJsTasks')), sets('before-tasks'))
    before(statement(call('finalizeWebpackProcessAssets')), `${observer}?.tasks(htmlTaskFactories.length, jsTaskFactories.length, cssTaskFactories.length, compilation);\n`)
    before(statement(call('finalizeCompilerShadowRun')), sets('after-tasks'))
  }
  else {
    const template = call('compilerOptions.templateHandler')
    const templateStatement = statement(template)
    assert.equal(template.arguments[0].getText(ast), 'readRawSource()')
    before(templateStatement, `const diagnosticHtmlSource = readRawSource();\nconst diagnosticHtmlCall = ${observer}?.input('html', file, diagnosticHtmlSource, transformRuntimeSet, compilation);\n`)
    edits.push({ start: template.arguments[0].getStart(ast), end: template.arguments[0].end, value: 'diagnosticHtmlSource' })
    after(templateStatement, `\n${observer}?.output(diagnosticHtmlCall, 'html', file, wxml, compilation);`)
    const skip = unique(ast, node => ts.isIfStatement(node) && ts.isCallExpression(node.expression) && node.expression.expression.getText(ast) === 'shouldSkipJsTransform', 'JS skip')
    before(skip, `const diagnosticJsCall = ${observer}?.input('js', file, currentSource, transformRuntimeSet, compilation);\n`)
    const returned = unique(skip, node => ts.isReturnStatement(node), 'JS skip return')
    before(returned, `${observer}?.output(diagnosticJsCall, 'js', file, currentSource, compilation, true);\n`)
    after(statement(call('compilerOptions.jsHandler')), `\n${observer}?.output(diagnosticJsCall, 'js', file, code, compilation);`)
  }
  edits.sort((a, b) => b.start - a.start)
  let output = source
  for (const edit of edits) output = output.slice(0, edit.start) + edit.value + output.slice(edit.end)
  const parsed = ts.createSourceFile(relative, output, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  assert.equal(parsed.parseDiagnostics.length, 0, '插桩结果必须可解析')
  return { source: output, receipt: { file: relative, originalSha256: sha256(source), instrumentedSha256: sha256(output), edits: edits.map(({ start, end }) => ({ start, end })) } }
}

export async function instrument(root, destination) {
  await assert.rejects(fs.access(path.join(root, '.git')), { code: 'ENOENT' }, '插桩只允许 Git-free 副本')
  const prepared = []
  for (const file of [`${base}/v5-assets.ts`, `${base}/v5-assets/html-js-tasks.ts`]) {
    prepared.push({ file, ...instrumentSource(await fs.readFile(path.join(root, file), 'utf8'), file) })
  }
  for (const entry of prepared) await fs.writeFile(path.join(root, entry.file), entry.source)
  await fs.writeFile(destination, `${JSON.stringify(prepared.map(entry => entry.receipt), null, 2)}\n`)
}
