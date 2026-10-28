import { Buffer } from 'node:buffer'
import fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { diagnosticSymbol } from '../../scripts/diagnostics/constants.mjs'
import { createUniInputObserver } from '../../scripts/diagnostics/uni-observer.mjs'

export const sourceRoot = fileURLToPath(new URL('../../../../', import.meta.url))
let sequence = 0
export async function loadSource(source, bindings = {}) {
  const ast = ts.createSourceFile('fixture.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  for (const node of [...ast.statements].reverse()) if (ts.isImportDeclaration(node)) source = source.slice(0, node.getStart(ast)) + source.slice(node.end)
  const key = `__uniInputFixture${++sequence}`
  globalThis[key] = bindings
  try {
    const prefix = `const { ${Object.keys(bindings).join(', ')} } = globalThis[${JSON.stringify(key)}];\n`
    const javascript = ts.transpileModule(prefix + source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText
    return await import(`data:text/javascript;base64,${Buffer.from(javascript).toString('base64')}#${sequence}`)
  }
  finally { delete globalThis[key] }
}
export async function readSource(relative) { return fs.readFile(new URL(relative, new URL('../../../../', import.meta.url)), 'utf8') }
export function eventObserver() {
  const events = []
  const observer = createUniInputObserver({ root: sourceRoot, phase: () => ({ type: 'mutation-write', round: 1 }), dependencies: { snapshot: () => ({ loaded: [], resolved: [], missingEvidence: [] }) }, operations: { emit(name, details, durationMs) { events.push({ sequence: events.length + 1, name, details, durationMs }); return events.length } } })
  globalThis[Symbol.for(diagnosticSymbol)] = { uniInput: observer }
  return { observer, events }
}
export function cacheFixture() {
  const entries = new Map()
  const calls = { lookups: 0, transforms: 0, hits: 0 }
  return { calls, async process({ key, rawSource, hash, onCacheHit, transform }) {
    calls.lookups++
    const signature = hash ?? rawSource
    const previous = entries.get(key)
    if (previous?.signature === signature) {
      calls.hits++
      await onCacheHit(previous.result)
      return previous.result
    }
    calls.transforms++
    const { result } = await transform()
    entries.set(key, { signature, result })
    return result
  } }
}
