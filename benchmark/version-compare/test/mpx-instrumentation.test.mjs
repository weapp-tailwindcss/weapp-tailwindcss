import { Buffer } from 'node:buffer'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { afterEach, describe, expect, it } from 'vitest'
import { diagnosticSymbol } from '../scripts/diagnostics/constants.mjs'
import { instrumentMpxSource, mpxTargets } from '../scripts/diagnostics/mpx-instrumentation.mjs'
import { createOperationRecorder } from '../scripts/diagnostics/operations.mjs'
import { prepareAllocationRoot } from '../scripts/diagnostics/prepare.mjs'

afterEach(() => {
  delete globalThis[Symbol.for(diagnosticSymbol)]
})

async function load(source) {
  const ast = ts.createSourceFile('fixture.ts', source, ts.ScriptTarget.Latest, true)
  for (const statement of ast.statements.filter(ts.isImportDeclaration).reverse()) {
    source = source.slice(0, statement.getStart(ast)) + source.slice(statement.end)
  }
  const output = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext } }).outputText
  return import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}#${Math.random()}`)
}

describe('Mpx 双版本 AST 与实际生命周期', () => {
  it.each(['baseline', 'current'])('%s 原生会话真实源码：复用、替换与释放语义保持', async (version) => {
    const source = await fs.readFile(new URL(`./fixtures/mpx-diagnostics/${version}-native.txt`, import.meta.url), 'utf8')
    const transformed = instrumentMpxSource(source, 'native', `${version}.ts`)
    const records = []
    const operations = createOperationRecorder({ root: '/fixture', phase: () => ({ type: 'build-start' }), writer: { write(name, value) {
      records.push({ name, value })
      return {}
    } } })
    globalThis[Symbol.for(diagnosticSymbol)] = { operations }
    const module = await load(transformed.source)
    let created = 0
    let disposed = 0
    const pool = new module.TailwindV4NativeSessionPool(() => {
      created++
      return { generate: async request => ({ candidates: [...request.candidates] }), dispose() {
        disposed++
      } }
    })
    const request = { candidates: new Set(['flex']) }
    const input = { css: 'a{}' }
    expect(await pool.generate('weapp', 'first', input, request)).toEqual({ candidates: ['flex'] })
    await pool.generate('weapp', 'first', input, request)
    expect(created).toBe(1)
    await pool.generate('weapp', 'second', { css: 'b{}' }, request)
    expect(created).toBe(2)
    const closing = pool.dispose()
    if (version === 'baseline') {
      expect(closing).toBeUndefined()
    }
    else {
      expect(pool.dispose()).toBe(closing)
    }
    await closing
    await Promise.resolve()
    expect(disposed).toBe(2)
    expect(records.filter(item => item.value.name === 'native.reuse')).toHaveLength(1)
    expect(records.filter(item => item.value.name === 'native.create.success')).toHaveLength(2)
    expect(records.filter(item => item.value.name === 'native.dispose.success')).toHaveLength(2)
    expect(() => instrumentMpxSource(transformed.source, 'native', 'again.ts')).toThrow('已插桩')
    expect(() => instrumentMpxSource(source.replace('this.createSession(source, preparation)', 'other(source, preparation)'), 'native', 'broken.ts')).toThrow('唯一')
  })

  it('当前所有真实源码锚点唯一且插桩后仍可解析；缺失和重复锚点明确失败', async () => {
    const root = fileURLToPath(new URL('../../../', import.meta.url))
    for (const [kind, relative] of mpxTargets) {
      const source = await fs.readFile(path.join(root, relative), 'utf8')
      const result = instrumentMpxSource(source, kind, relative)
      expect(result.anchor.anchors.length).toBeGreaterThan(0)
      expect(() => instrumentMpxSource('', kind, relative)).toThrow()
      expect(() => instrumentMpxSource(`${source}\n${source}`, kind, relative)).toThrow('唯一')
    }
  })

  it('准备副本登记缺失服务能力，全部锚点确认前不写入，禁止任意降级', async () => {
    const sourceRoot = fileURLToPath(new URL('../../../', import.meta.url))
    const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'mpx-prepare-'))
    const root = path.join(temporary, 'copy')
    const store = 'packages/weapp-tailwindcss/src/project-sources/candidates/store.ts'
    try {
      for (const relative of [store, ...mpxTargets.filter(([kind]) => kind !== 'service').map(([, file]) => file)]) {
        const file = path.join(root, relative)
        await fs.mkdir(path.dirname(file), { recursive: true })
        await fs.copyFile(path.join(sourceRoot, relative), file)
      }
      const nativeFile = path.join(root, mpxTargets.find(([kind]) => kind === 'native')[1])
      const original = await fs.readFile(nativeFile, 'utf8')
      await fs.writeFile(nativeFile, original.replace('this.createSession(source, preparation)', 'unknownFactory(source, preparation)'))
      await expect(prepareAllocationRoot(root, sourceRoot, path.join(temporary, 'evidence'), 'demo-mpx-tailwindcss-v4__mp-weixin')).rejects.toThrow('唯一')
      expect(await fs.readFile(path.join(root, store), 'utf8')).toBe(await fs.readFile(path.join(sourceRoot, store), 'utf8'))
      await fs.writeFile(nativeFile, original)
      await prepareAllocationRoot(root, sourceRoot, path.join(temporary, 'evidence'), 'demo-mpx-tailwindcss-v4__mp-weixin')
      const manifest = JSON.parse(await fs.readFile(path.join(temporary, 'evidence/instrumentation.json'), 'utf8'))
      expect(manifest.absentCapabilities).toEqual([expect.objectContaining({ kind: 'service' })])
      expect(manifest.manifest.map(item => item.anchor.kind)).toEqual(['store', 'webpack', 'scan', 'generator', 'native', 'engine', 'compile'])
    }
    finally {
      await fs.rm(temporary, { recursive: true, force: true })
    }
  })
})
