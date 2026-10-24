import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import ts from 'typescript'
import { diagnosticSymbol, mpxProject } from './constants.mjs'
import { instrumentMpxSource, mpxTargets } from './mpx-instrumentation.mjs'
import { guardDiagnosticObserver } from './observer-guard.mjs'
import { generationTargets, instrumentOperationSource } from './operation-instrumentation.mjs'
import { instrumentViteTailSource } from './vite-tail-instrumentation.mjs'
import { viteTailProject } from './vite-tail-observer.mjs'

const targets = [
  { relative: 'packages/weapp-tailwindcss/src/project-sources/candidates/store.ts', kind: 'store', name: 'createSourceCandidateStore' },
  { relative: 'packages/weapp-tailwindcss/src/bundlers/vite/generate-bundle/finalize/bundle.ts', kind: 'compilation', name: 'finalizeGenerateBundle' },
]
const observer = `(globalThis as any)[Symbol.for(${JSON.stringify(diagnosticSymbol)})]`
const sha256 = value => createHash('sha256').update(value).digest('hex')

export function instrumentDiagnosticSource(source, target) {
  const ast = ts.createSourceFile(target.relative, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  if (ast.parseDiagnostics.length) {
    throw new Error(`诊断 AST 无法解析：${target.relative}`)
  }
  const matches = ast.statements.filter(node => ts.isFunctionDeclaration(node) && node.name?.text === target.name)
  if (matches.length !== 1 || !matches[0].body) {
    throw new Error(`诊断函数锚点必须唯一：${target.name}`)
  }
  const fn = matches[0]
  if (source.includes(diagnosticSymbol)) {
    throw new Error(`拒绝重复诊断注入：${target.relative}`)
  }
  let start
  let end
  let replacement
  if (target.kind === 'store') {
    const returns = fn.body.statements.filter(ts.isReturnStatement)
    if (returns.length !== 1 || !returns[0].expression || !ts.isObjectLiteralExpression(returns[0].expression)) {
      throw new Error('候选 store 的直接返回结构已改变，拒绝不完整观测')
    }
    const expression = returns[0].expression
    const names = expression.properties.map(property => property.name?.getText(ast))
    if (!['snapshot', 'values', 'sources', 'getRevision'].every(name => names.includes(name))) {
      throw new Error('候选 store 缺失只读诊断契约')
    }
    start = expression.getStart(ast)
    end = expression.end
    replacement = `${observer} === undefined ? ${source.slice(start, end)} : ((store: any) => { ${observer}.registerStore(store); return store })(${source.slice(start, end)})`
  }
  else {
    const endings = fn.body.statements.filter(node => ts.isExpressionStatement(node)
      && ts.isCallExpression(node.expression) && node.expression.expression.getText(ast) === 'onEnd')
    if (endings.length !== 1 || !fn.modifiers?.some(node => node.kind === ts.SyntaxKind.AsyncKeyword)) {
      throw new Error('Vite 完成边界必须唯一且可等待诊断完成')
    }
    const bindings = new Set()
    for (const statement of fn.body.statements) {
      if (!ts.isVariableStatement(statement)) {
        continue
      }
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isObjectBindingPattern(declaration.name)) {
          for (const element of declaration.name.elements) {
            bindings.add(element.name.getText(ast))
          }
        }
      }
    }
    const names = ['sourceCandidates', 'runtime', 'transformRuntime', 'generatorRuntime']
    if (!names.every(name => bindings.has(name))) {
      throw new Error('Vite 完成边界缺失实际候选集合')
    }
    start = end = endings[0].getStart(ast)
    replacement = `await ${observer}.compilation({ ${names.join(', ')} })\n  `
  }
  const instrumented = source.slice(0, start) + replacement + source.slice(end)
  return { source: target.kind === 'compilation' ? guardDiagnosticObserver(instrumented, target.relative) : instrumented, anchor: { function: target.name, kind: target.kind, offset: start } }
}

export async function prepareAllocationRoot(root, sourceRoot, evidenceDirectory, project) {
  const realRoot = await fs.realpath(root)
  if (realRoot === await fs.realpath(sourceRoot)) {
    throw new Error('拒绝向源码工作树注入诊断')
  }
  try {
    await fs.access(path.join(realRoot, '.git'))
    throw new Error('诊断只能写入无 Git 元数据的 benchmark 副本')
  }
  catch (error) {
    if (error.code !== 'ENOENT') {
      throw error
    }
  }
  const prepared = []
  const selected = project === mpxProject
    ? [targets[0], ...mpxTargets.map(([kind, relative]) => ({ kind, relative }))]
    : [...targets, ...generationTargets.map(([kind, relative]) => ({ kind, relative }))]
  if (project === viteTailProject) {
    selected.push({ kind: 'vite-tail-css', relative: 'packages/weapp-tailwindcss/src/bundlers/vite/css-finalizer/plugin.ts' })
  }
  const absentCapabilities = []
  for (const target of selected) {
    const file = path.resolve(realRoot, target.relative)
    let source
    try {
      source = await fs.readFile(file, 'utf8')
    }
    catch (error) {
      if (target.kind === 'service' && error.code === 'ENOENT') {
        absentCapabilities.push({ kind: 'service', file: target.relative, reason: '该源码版本没有 compiler 服务池，不能虚构零次调用' })
        continue
      }
      throw error
    }
    const transformed = target.kind === 'vite-tail-css'
      ? instrumentViteTailSource(source, 'css', target.relative)
      : target.name ? instrumentDiagnosticSource(source, target) : (project === mpxProject ? instrumentMpxSource : instrumentOperationSource)(source, target.kind, target.relative)
    prepared.push({ target, file, original: source, ...transformed })
  }
  // 所有锚点均验证成功后再写入副本，不容许半套观测协议启动。
  await fs.mkdir(evidenceDirectory, { recursive: true })
  for (const item of prepared) {
    await fs.writeFile(item.file, item.source)
  }
  const manifest = prepared.map(item => ({ file: item.target.relative, anchor: item.anchor, originalSha256: sha256(item.original), instrumentedSha256: sha256(item.source) }))
  await fs.writeFile(path.join(evidenceDirectory, 'instrumentation.json'), `${JSON.stringify({ root: realRoot, symbol: diagnosticSymbol, manifest, absentCapabilities }, null, 2)}\n`)
  return manifest
}
