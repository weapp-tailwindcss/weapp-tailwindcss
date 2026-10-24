import { Buffer } from 'node:buffer'
import fs from 'node:fs/promises'
import ts from 'typescript'
import { instrumentMpxSource, mpxTargets } from '../../scripts/diagnostics/mpx-instrumentation.mjs'

let nextFixture = 0

export async function loadSource(source, prelude = '', fixture = {}) {
  const ast = ts.createSourceFile('fixture.ts', source, ts.ScriptTarget.Latest, true)
  for (const statement of ast.statements.filter(ts.isImportDeclaration).reverse()) {
    source = source.slice(0, statement.getStart(ast)) + source.slice(statement.end)
  }
  const key = `weapp-tailwindcss.mpx-test.${++nextFixture}`
  globalThis[Symbol.for(key)] = fixture
  try {
    const output = ts.transpileModule(`const fixture = globalThis[Symbol.for(${JSON.stringify(key)})];\n${prelude}\n${source}`, {
      compilerOptions: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext },
    }).outputText
    return await import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}#${nextFixture}`)
  }
  finally { delete globalThis[Symbol.for(key)] }
}

export async function actualSource(kind, instrumented = true) {
  const relative = mpxTargets.find(([name]) => name === kind)[1]
  const source = await fs.readFile(new URL(`../../../../${relative}`, import.meta.url), 'utf8')
  return instrumented ? instrumentMpxSource(source, kind, relative).source : source
}

export function findNodes(source, predicate) {
  const ast = ts.createSourceFile('fixture.ts', source, ts.ScriptTarget.Latest, true)
  const matches = []
  function visit(node) {
    if (predicate(node, ast)) {
      matches.push(node)
    }
    ts.forEachChild(node, visit)
  }
  visit(ast)
  return { ast, matches }
}

export function actualFunction(source, name) {
  const { ast, matches } = findNodes(source, node => ts.isFunctionDeclaration(node) && node.name?.text === name)
  if (matches.length !== 1) {
    throw new Error(`真实函数锚点必须唯一：${name}`)
  }
  return matches[0].getText(ast)
}
