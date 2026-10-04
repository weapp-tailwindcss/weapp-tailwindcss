import type { ITemplateHandlerOptions } from '../../src/types'
import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, relative, resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { sourceDigest, verifyBinding } from '../distribution.mjs'

// 默认仅自检；正式采样需显式传 --measure，可用 --iterations=200 调整每批调用次数。
type Mode = 'off' | 'required'
type Callable = (...args: any[]) => any
type Binding = Record<string, Callable>
type Method = 'createWxmlTransformer' | 'transformStatic' | 'tokenizeWxml'
type Counts = Record<Method, { calls: number, nulls: number }>
interface LoadedBinding { path: string, sha256: string, metadata: Record<string, unknown> }
interface ExtensionModule { exports: Binding }
type Extension = (module: ExtensionModule, filename: string) => void

const require = createRequire(import.meta.url)
const nativeRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const packageRoot = resolve(nativeRoot, '..')
const repoRoot = resolve(packageRoot, '..', '..')
const sha256 = (input: string | Buffer) => createHash('sha256').update(input).digest('hex')
const utf16Hash = (input: unknown) => sha256(Buffer.from(JSON.stringify(input), 'utf16le'))
const emptyCounts = (): Counts => ({ createWxmlTransformer: { calls: 0, nulls: 0 }, transformStatic: { calls: 0, nulls: 0 }, tokenizeWxml: { calls: 0, nulls: 0 } })

function instrument() {
  let counts = emptyCounts()
  const bindings: LoadedBinding[] = []
  const restores: Array<() => void> = []
  let compiler: Binding | undefined
  const wrapped = new WeakSet<object>()
  const loader = require('node:module') as { _extensions: Record<string, Extension> }
  const originalExtension = loader._extensions['.node']!
  function wrap(object: Binding, method: Method) {
    const original = object[method]!
    const descriptor = Object.getOwnPropertyDescriptor(object, method)
    Object.defineProperty(object, method, {
      configurable: true,
      writable: true,
      value(this: unknown, ...args: unknown[]) {
        counts[method].calls++
        const result = original.apply(this, args)
        if (result === null) {
          counts[method].nulls++
        }
        if (method === 'createWxmlTransformer' && result && !wrapped.has(result)) {
          wrapped.add(result)
          wrap(result, 'transformStatic')
        }
        return result
      },
    })
    restores.push(() => descriptor ? Object.defineProperty(object, method, descriptor) : Reflect.deleteProperty(object, method))
  }
  const extension: Extension = (module, filename) => {
    originalExtension(module, filename)
    if (typeof module.exports.createWxmlTransformer !== 'function' || typeof module.exports.tokenizeWxml !== 'function') {
      return
    }
    const path = realpathSync(filename)
    const metadataPath = existsSync(`${path}.json`) ? `${path}.json` : join(dirname(path), 'native-metadata.json')
    const metadata = JSON.parse(readFileSync(metadataPath, 'utf8'))
    verifyBinding(metadata.target, path, metadata, nativeRoot)
    bindings.push({ path, sha256: sha256(readFileSync(path)), metadata })
    assert(!compiler, 'WXML benchmark must load exactly one core binding')
    compiler = module.exports
    wrap(compiler, 'createWxmlTransformer')
    wrap(compiler, 'tokenizeWxml')
  }
  loader._extensions['.node'] = extension
  return {
    bindings,
    reset() { counts = emptyCounts() },
    snapshot() { return structuredClone(counts) },
    checkNullCounter() {
      assert(compiler, 'required adapter never loaded a native binding')
      const transformer = compiler.createWxmlTransformer!([])
      assert(transformer)
      assert.equal(transformer.transformStatic('{{value}}'), null)
      assert.equal(counts.transformStatic.nulls, 1)
    },
    restore() {
      assert.equal(loader._extensions['.node'], extension, 'Native loader ownership changed')
      loader._extensions['.node'] = originalExtension
      for (const restore of restores.reverse()) {
        restore()
      }
    },
  }
}

function sourceFiles() {
  const files: string[] = []
  function visit(path: string) {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      const child = join(path, entry.name)
      if (entry.isDirectory()) {
        visit(child)
      }
      else if (/\.(?:[cm]?[jt]s|json)$/.test(entry.name)) {
        files.push(child)
      }
    }
  }
  visit(join(packageRoot, 'src', 'wxml'))
  if (existsSync(join(packageRoot, 'src', 'native'))) {
    visit(join(packageRoot, 'src', 'native'))
  }
  files.push(join(packageRoot, 'src', 'native.ts'), fileURLToPath(import.meta.url))
  return files.sort().map(file => ({ file: relative(repoRoot, file), sha256: sha256(readFileSync(file)) }))
}

function dependency(name: string) {
  const entry = realpathSync(fileURLToPath(import.meta.resolve(name)))
  let root = dirname(entry)
  while (!existsSync(join(root, 'package.json'))) {
    const parent = dirname(root)
    assert.notEqual(parent, root, `Cannot locate dependency manifest: ${name}`)
    root = parent
  }
  const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  return { name, version: manifest.version, entry, entrySha256: sha256(readFileSync(entry)) }
}

const shortTokens = ['w-[1px]', 'text-[#123456]', 'hover:bg-red-500']
const longTokens = Array.from({ length: 256 }, (_, index) => `${index % 3 ? '' : 'md:'}w-[${index + 1}px]`)
const cases = [shortTokens, longTokens].flatMap((tokens, size) => [false, true].flatMap(dynamic => [false, true].map(exact => ({
  name: `${size ? 'long' : 'short'}-${dynamic ? 'dynamic' : 'static'}-${exact ? 'exact' : 'default'}`,
  dynamic,
  source: ` ${tokens.join(' \t')} ${dynamic ? '{{ active ? "h-[2px]" : "opacity-50" }} w-[3px]' : ''}\r\n`,
  options: exact ? { classSetMode: 'exact', runtimeSet: new Set([...tokens.filter((_, index) => index % 2 === 0), ...Array.from({ length: 5_000 }, (_, index) => `unrelated-${index}`)]) } satisfies ITemplateHandlerOptions : {},
}))))

const measured = process.argv.includes('--measure')
assert(!(measured && process.argv.includes('--self-check')), 'Choose --measure or --self-check')
const iterations = measured ? Number(process.argv.find(value => value.startsWith('--iterations='))?.slice('--iterations='.length) ?? 200) : 1
assert(Number.isSafeInteger(iterations) && iterations > 0 && iterations <= 1_000_000)
const originalMode = process.env.WEAPP_TW_NATIVE
process.env.WEAPP_TW_NATIVE = 'required'
const counter = instrument()

async function run() {
  try {
    const { templateReplacer } = await import('../../src/wxml/index')
    const metadata = {
      node: process.version,
      executable: process.execPath,
      platform: `${process.platform}-${process.arch}`,
      gitHead: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim(),
      gitStatus: execFileSync('git', ['status', '--short'], { cwd: repoRoot, encoding: 'utf8' }).trim(),
      lockfileSha256: sha256(readFileSync(join(repoRoot, 'pnpm-lock.yaml'))),
      rustSourceDigest: sourceDigest(nativeRoot),
      dynamicJsHandler: 'omitted: the public default preserves dynamic expressions',
      sourceFiles: sourceFiles(),
      dependencies: ['@weapp-tailwindcss/escape', 'magic-string', 'htmlparser2', 'tsx'].map(dependency),
      inputs: cases.map(value => ({ name: value.name, bytesUtf8: Buffer.byteLength(value.source), codeUnits: value.source.length, sha256Utf16le: utf16Hash(value.source), classSetSize: value.options.runtimeSet?.size ?? 0, classSetSha256Utf16le: utf16Hash([...(value.options.runtimeSet ?? [])]) })),
    }
    function batch(input: typeof cases[number], mode: Mode, repeat: number, timed: boolean) {
      process.env.WEAPP_TW_NATIVE = mode
      counter.reset()
      const outputs = Array.from({ length: repeat }).fill('')
      const start = timed ? performance.now() : 0
      for (let index = 0; index < repeat; index++) {
        outputs[index] = templateReplacer(input.source, input.options)
      }
      const milliseconds = timed ? performance.now() - start : undefined
      return { mode, milliseconds, outputs, counts: counter.snapshot() }
    }
    function verify(input: typeof cases[number], pair: ReturnType<typeof batch>[]) {
      const off = pair.find(value => value.mode === 'off')!
      const required = pair.find(value => value.mode === 'required')!
      assert.deepEqual(off.outputs, required.outputs, `${input.name}: off/required output mismatch`)
      assert.deepEqual(off.counts, emptyCounts(), 'off must not invoke any native ABI')
      if (input.dynamic) {
        assert.equal(required.counts.tokenizeWxml.calls, required.outputs.length)
        assert.equal(required.counts.transformStatic.calls, required.counts.transformStatic.nulls, 'Dynamic input must fall back or skip the static ABI')
      }
      else {
        assert.equal(required.counts.transformStatic.calls, required.outputs.length)
        assert.equal(required.counts.transformStatic.nulls, 0)
        assert.equal(required.counts.tokenizeWxml.calls, 0)
      }
      return utf16Hash(off.outputs[0])
    }
    const selfCheck = cases.map((input) => {
      const pair = [batch(input, 'off', 1, false), batch(input, 'required', 1, false)]
      return { name: input.name, outputSha256Utf16le: verify(input, pair), counts: pair.map(({ mode, counts }) => ({ mode, counts })) }
    })
    counter.reset()
    counter.checkNullCounter()
    const directAbiSelfCheck = counter.snapshot()
    const samples: Array<{ name: string, round: number, pair: number, order: Mode[], outputSha256Utf16le: string, results: Array<Omit<ReturnType<typeof batch>, 'outputs'>> }> = []
    if (measured) {
      for (const input of cases) {
        verify(input, [batch(input, 'off', 100, false), batch(input, 'required', 100, false)])
      }
      for (let round = 0; round < 3; round++) {
        for (let pair = 0; pair < 20; pair++) {
          const order: Mode[] = pair % 2 ? ['required', 'off'] : ['off', 'required']
          for (const input of cases) {
            const results = order.map(mode => batch(input, mode, iterations, true))
            samples.push({ name: input.name, round, pair, order, outputSha256Utf16le: verify(input, results), results: results.map(({ outputs: _, ...result }) => result) })
          }
        }
      }
    }
    assert.deepEqual(sourceFiles(), metadata.sourceFiles, 'Measured adapter source changed during sampling')
    assert.equal(sha256(readFileSync(join(repoRoot, 'pnpm-lock.yaml'))), metadata.lockfileSha256)
    for (const binding of counter.bindings) {
      assert.equal(sha256(readFileSync(binding.path)), binding.sha256)
    }
    process.stdout.write(`${JSON.stringify({
      performanceMeasured: measured,
      scope: 'Public templateReplacer adapter including TypeScript, NAPI and constant ABI counters; excludes mode switching, output comparison and hashing. Warm handler only; no full-build speed claim.',
      rounds: measured ? 3 : 0,
      pairsPerRound: measured ? 20 : 0,
      iterations,
      warmupIterationsPerModeAndCase: measured ? 100 : 0,
      metadata,
      loadedBindings: counter.bindings,
      selfCheck,
      directAbiSelfCheck,
      samples,
    }, null, 2)}\n`)
  }
  finally {
    counter.restore()
    if (originalMode === undefined) {
      delete process.env.WEAPP_TW_NATIVE
    }
    else {
      process.env.WEAPP_TW_NATIVE = originalMode
    }
  }
}

run().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`)
  process.exitCode = 1
})
