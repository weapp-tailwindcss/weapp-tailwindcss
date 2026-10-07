import type { Analysis, Mode, Request, WorkerReply } from './types'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
import process from 'node:process'
import { pathToFileURL } from 'node:url'

const [root, mode] = process.argv.slice(2) as [string, Mode]
const packageRoot = resolve(root, 'packages', 'weapp-tailwindcss')
const require = createRequire(join(packageRoot, 'package.json'))
const parser = require('oxc-parser') as typeof import('oxc-parser')

assert.equal(typeof parser.rawTransferSupported, 'function')
assert.ok(parser.rawTransferSupported(), 'This runtime does not support Oxc raw transfer')
const originalParse = parser.parseSync
let parserCalls = 0
const parseSync: typeof originalParse = (filename, source, options) => {
  parserCalls++
  const forcedOptions = { ...options, experimentalRawTransfer: mode === 'raw' }
  return originalParse(filename, source, forcedOptions)
}
// ESM 命名空间不可直接赋值；替换当前 worker 的 require 缓存导出，不修改产品模块。
const cachedParser = require.cache[require.resolve('oxc-parser')]
assert.ok(cachedParser, 'Oxc must be present in the worker require cache')
cachedParser.exports = { ...parser, parseSync }

function versionOf(name: string) {
  // 按此消费包的 Node 查找顺序读取版本，兼容只提供 import 条件的依赖。
  for (const directory of require.resolve.paths(name) ?? []) {
    const path = join(directory, name, 'package.json')
    if (existsSync(path)) {
      const manifest = JSON.parse(readFileSync(path, 'utf8'))
      assert.equal(manifest.name, name)
      return String(manifest.version)
    }
  }
  throw new Error(`Cannot resolve package version for ${name}`)
}

function send(reply: WorkerReply) {
  assert.ok(process.send, 'Worker must be launched with IPC')
  process.send(reply)
}

function fail(error: unknown) {
  send({ type: 'error', message: String(error), stack: error instanceof Error ? error.stack : undefined })
}

async function main() {
  const { MappingChars2String } = require('@weapp-tailwindcss/escape') as typeof import('@weapp-tailwindcss/escape')
  const options = {
    filename: 'raw-transfer-benchmark.js',
    experimentalJsFastPath: 'oxc' as const,
    generateMap: false,
    escapeMap: MappingChars2String,
    classNameSet: new Set(['w-[10px]', 'h-[20px]', 'mt-[2px]', 'p-[3px]', 'gap-[4px]', 'flex']),
    babelParserOptions: { sourceType: 'module' as const },
  }
  const analysisModule = await import(pathToFileURL(join(packageRoot, 'src', 'js', 'fast-path', 'analysis.ts')).href) as { getOxcSourceAnalysis: (source: string, handlerOptions: typeof options) => Analysis | undefined }
  const handlerModule = await import(pathToFileURL(join(packageRoot, 'src', 'js', 'fast-path', 'oxc.ts')).href) as { oxcJsHandler: (source: string, handlerOptions: typeof options) => { code: string } | undefined }
  const analyze = (source: string) => {
    const result = analysisModule.getOxcSourceAnalysis(source, options)
    assert.ok(result, 'Source analysis rejected the generated complete source')
    return result
  }
  const transform = (source: string) => {
    const result = handlerModule.oxcJsHandler(source, options)
    assert.ok(result, 'Oxc handler fell back; the benchmark is invalid')
    return result.code
  }
  process.on('message', (request: Request) => {
    try {
      const beforeRequest = parserCalls
      if (request.phase.startsWith('warm')) {
        analyze(request.source)
        assert.equal(parserCalls - beforeRequest, 1, 'Warmup input unexpectedly hit the analysis cache')
      }
      const operation = request.phase.endsWith('analysis') ? analyze : transform
      const beforeTimed = parserCalls
      const start = performance.now()
      for (let index = 0; index < request.iterations; index++) {
        operation(request.source)
      }
      const elapsedMs = performance.now() - start
      const timedParserCalls = parserCalls - beforeTimed
      assert.equal(timedParserCalls, request.phase.startsWith('cold') ? 1 : 0)
      const analysis = analyze(request.source)
      const code = transform(request.source)
      assert.equal(parserCalls - beforeRequest, 1, 'Verification unexpectedly re-parsed the source')
      assert.notEqual(code, request.source, 'The fixture did not exercise class replacement')
      assert.ok(analysis.literals.some(literal => literal.isConditionTest))
      assert.ok(analysis.literals.some(literal => literal.kind === 'template'))
      send({ type: 'measurement', mode, elapsedMs, perOperationMs: elapsedMs / request.iterations, iterations: request.iterations, timedParserCalls, totalParserCalls: parserCalls - beforeRequest, analysis, code })
    }
    catch (error) {
      fail(error)
    }
  })
  send({
    type: 'ready',
    mode,
    node: process.version,
    v8: process.versions.v8,
    parserEntry: require.resolve('oxc-parser'),
    versions: Object.fromEntries(['oxc-parser', 'oxc-walker', 'lru-cache', 'magic-string', '@weapp-tailwindcss/escape', '@weapp-tailwindcss/engine'].map(name => [name, versionOf(name)])),
  })
}

main().catch(fail)
