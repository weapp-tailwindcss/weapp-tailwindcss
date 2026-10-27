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
import { verifyServiceEvidence } from '../scripts/diagnostics/service-evidence.mjs'

afterEach(() => {
  delete globalThis[Symbol.for(diagnosticSymbol)]
})

async function load(source, prelude = '') {
  const ast = ts.createSourceFile('fixture.ts', source, ts.ScriptTarget.Latest, true)
  for (const statement of ast.statements.filter(ts.isImportDeclaration).reverse()) {
    source = source.slice(0, statement.getStart(ast)) + source.slice(statement.end)
  }
  const output = ts.transpileModule(`${prelude}\n${source}`, { compilerOptions: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext } }).outputText
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

  it('真实服务池源码保持多租约、同 key 不同代际及幂等关闭，证据拒绝身份串联错误', async () => {
    const relative = mpxTargets.find(([kind]) => kind === 'service')[1]
    const source = await fs.readFile(new URL(`../../../${relative}`, import.meta.url), 'utf8')
    const transformed = instrumentMpxSource(source, 'service', relative)
    const records = []
    const operations = createOperationRecorder({ root: '/fixture', phase: () => ({ type: 'build-start' }), writer: { write(name, value) {
      records.push(value)
      return {}
    } } })
    globalThis[Symbol.for(diagnosticSymbol)] = { operations }
    const module = await load(transformed.source, `
const snapshotConfiguration = value => structuredClone(value);
const createGeneratorServiceKey = source => source.css;
const copyGeneratorServiceResult = result => ({ ...result });
const createWeappTailwindcssGenerator = () => { throw new Error('fixture must supply factory'); };
`)
    let disposed = 0
    const pool = new module.CompilerGeneratorServicePool(() => ({ generate: async () => ({ css: 'a{}' }), dispose() {
      disposed++
    } }))
    const input = { css: 'same-key', sources: [] }
    const first = pool.acquire(input, {})
    const second = pool.acquire(input, {})
    expect(pool.matches(first, input, {})).toBe(true)
    expect(pool.matches(undefined, input, {})).toBe(false)
    pool.invalidate(first)
    expect(pool.matches(first, input, {})).toBe(false)
    const third = pool.acquire(input, {})
    await third.generate({ candidates: new Set(['flex']) })
    const closing = first.dispose()
    expect(first.dispose()).toBe(closing)
    await closing
    await second.dispose()
    await third.dispose()
    await pool.dispose()
    const events = records.filter(record => record.name?.startsWith('service.'))
    const acquisitions = events.filter(event => event.name === 'service.acquire')
    expect(acquisitions.map(event => event.details.references)).toEqual([1, 2, 1])
    expect(acquisitions[0].details.serviceId).toBe(acquisitions[1].details.serviceId)
    expect(acquisitions[2].details.serviceId).not.toBe(acquisitions[0].details.serviceId)
    expect(acquisitions.map(event => event.details.key)).toEqual(['same-key', 'same-key', 'same-key'])
    expect(events.filter(event => event.name === 'service.release.start')).toHaveLength(3)
    expect(events.filter(event => event.name === 'service.matches.success').map(event => event.details.result)).toEqual([true, false, false])
    expect(disposed).toBe(2)
    expect(verifyServiceEvidence(events)).toEqual({ services: 2, leases: 3, releasedLeases: 3 })
    for (const patch of [{ leaseId: 99999 }, { ownerId: 99999 }, { serviceId: acquisitions[2].details.serviceId }]) {
      const malformed = structuredClone(events)
      Object.assign(malformed.find(event => event.name === 'service.release.start').details, patch)
      expect(() => verifyServiceEvidence(malformed)).toThrow('身份与 acquire 不一致')
    }
    const release = events.find(event => event.name === 'service.release.start')
    expect(() => verifyServiceEvidence([...events, { ...release, sequence: 99999 }])).toThrow('重复实际释放')
    const malformedMatch = structuredClone(events)
    malformedMatch.filter(event => event.name === 'service.matches.success').at(-1).details.result = true
    expect(() => verifyServiceEvidence(malformedMatch)).toThrow('已释放或退役')
  })

  it('真实扫描函数的无分号原文插桩后保持独立语句，并使用原有读取结果', async () => {
    const relative = mpxTargets.find(([kind]) => kind === 'scan')[1]
    const source = await fs.readFile(new URL(`../../../${relative}`, import.meta.url), 'utf8')
    const transformed = instrumentMpxSource(source, 'scan', relative)
    const seen = []
    globalThis[Symbol.for(diagnosticSymbol)] = { operations: { source(file, text) {
      seen.push({ file, text })
    } } }
    const module = await load(`${transformed.source}\nexport { resolveScanFileSnapshot };`, `
const stat = async () => ({ mtimeMs: 1, size: 4 });
const readSourceCandidateFile = async () => 'a{}';
const md5Hash = value => 'hash:' + value;
`)
    expect(await module.resolveScanFileSnapshot('fixture.mpx')).toEqual({ meta: { contentHash: 'hash:a{}', mtimeMs: 1, size: 4 }, source: 'a{}' })
    expect(seen).toEqual([{ file: 'fixture.mpx', text: 'a{}' }])
  })

  it('受控执行真实服务、生成器与原生池源码，facade、engine、pool 和 session 身份闭环', async () => {
    const records = []
    const operations = createOperationRecorder({ root: '/fixture', phase: () => ({ type: 'build-start' }), writer: { write(name, value) {
      records.push(value)
      return {}
    } } })
    const observer = { operations }
    globalThis[Symbol.for(diagnosticSymbol)] = observer
    async function instrumented(kind, prelude) {
      const relative = mpxTargets.find(([name]) => name === kind)[1]
      const source = await fs.readFile(new URL(`../../../${relative}`, import.meta.url), 'utf8')
      return load(instrumentMpxSource(source, kind, relative).source, prelude)
    }
    const native = await instrumented('native', `
const createTailwindGenerationSession = () => ({ generate: async () => ({ css: 'a{}', rawCss: 'a{}' }), dispose() {} });
`)
    observer.NativePool = native.TailwindV4NativeSessionPool
    const generator = await instrumented('generator', `
const TailwindV4NativeSessionPool = globalThis[Symbol.for(${JSON.stringify(diagnosticSymbol)})].NativePool;
const createEngineTailwindV4Engine = () => ({ dispose() {} });
const incrementalGenerateCache = new Map();
const generateRawArtifact = (pool, source, options) => pool.generate('weapp', 'stable', source, options);
const transformGeneratedArtifact = value => value;
`)
    const service = await instrumented('service', `
const snapshotConfiguration = value => structuredClone(value);
const createGeneratorServiceKey = source => source.css;
const copyGeneratorServiceResult = result => ({ ...result });
`)
    const pool = new service.CompilerGeneratorServicePool(generator.createTailwindV4Engine)
    const facade = pool.acquire({ css: 'a{}', sources: [] }, {})
    await facade.generate({ candidates: new Set(['flex']) })
    await facade.dispose()
    await pool.dispose()
    const event = name => records.find(record => record.name === name).details
    const acquired = event('service.acquire')
    expect(acquired.generatorId).toBe(operations.identity(facade))
    expect(acquired.serviceGeneratorId).not.toBe(acquired.generatorId)
    expect(acquired.serviceGeneratorId).toBe(event('service.create.success').resultId)
    expect(acquired.serviceGeneratorId).toBe(event('generator.create.success').resultId)
    expect(event('generator.generate.start').engineId).toBe(acquired.serviceGeneratorId)
    expect(event('generator.dispose.start').engineId).toBe(acquired.serviceGeneratorId)
    const nativePoolId = event('generator.generate.start').poolId
    expect(event('generator.dispose.start').poolId).toBe(nativePoolId)
    expect(event('native.create.start').poolId).toBe(nativePoolId)
    expect(event('native.generate.start').poolId).toBe(nativePoolId)
    expect(event('native.dispose.start').poolId).toBe(nativePoolId)
    expect(event('native.generate.start').sessionId).toBe(event('native.create.success').resultId)
    expect(event('native.dispose.start').sessionId).toBe(event('native.create.success').resultId)
    expect(verifyServiceEvidence(records.filter(record => record.name?.startsWith('service.')))).toEqual({ services: 1, leases: 1, releasedLeases: 1 })
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
