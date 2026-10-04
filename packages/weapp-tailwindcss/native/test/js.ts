import type { IJsHandlerOptions } from '../../src/types'
import assert from 'node:assert/strict'
import process from 'node:process'
import { MappingChars2String } from '@weapp-tailwindcss/escape'
import { createInput } from '../../benchmark/oxc-raw-transfer/input'
import { tryCreateJsRuntimeAffectingSignature } from '../../src/compiler/runtime-affecting-signature/js'
import { createJsHandler } from '../../src/js'
import { jsHandler } from '../../src/js/babel'
import { getOxcSourceAnalysis } from '../../src/js/fast-path/analysis'
import { oxcJsHandler } from '../../src/js/fast-path/oxc'
import { loadNativeCompiler } from '../../src/native'
import { classNames, javascriptCases, jsxCases, sourceCases, typescriptCases } from './js-cases'

assert.equal(process.env.WEAPP_TW_NATIVE, 'required', 'ABI verification must explicitly require native execution')
const compiler = loadNativeCompiler()
assert.ok(compiler, 'Native binding is required')
const analyze = compiler.analyzeJs
const signature = compiler.jsRuntimeSignature
let nativeAnalyses = 0
let nativeSignatures = 0
compiler.analyzeJs = (...args) => {
  nativeAnalyses++
  return analyze(...args)
}
compiler.jsRuntimeSignature = (source) => {
  nativeSignatures++
  return signature(source)
}

function withMode<T>(mode: 'off' | 'required', run: () => T): T {
  const previous = process.env.WEAPP_TW_NATIVE
  process.env.WEAPP_TW_NATIVE = mode
  try {
    return run()
  }
  finally {
    process.env.WEAPP_TW_NATIVE = previous
  }
}

const base: IJsHandlerOptions = {
  escapeMap: MappingChars2String,
  classNameSet: classNames,
  experimentalJsFastPath: 'oxc',
  generateMap: false,
  needEscaped: true,
  unescapeUnicode: true,
  babelParserOptions: { sourceType: 'module', plugins: ['jsx', 'typescript'] },
}
let cases = 0
let compatibleFallbacks = 0
try {
  for (const { source, lang, sourceType, preserveParens } of sourceCases()) {
    const options: IJsHandlerOptions = {
      ...base,
      filename: `entry.${lang}`,
      babelParserOptions: { sourceType, createParenthesizedExpressions: preserveParens, plugins: ['jsx', 'typescript'] },
    }
    const label = `${lang}/${sourceType}/parens=${preserveParens}: ${source}`
    const expected = withMode('off', () => getOxcSourceAnalysis(source, options))
    const direct = compiler.analyzeJs(source, lang, sourceType, preserveParens)
    // 孤立代理不能无损交给 UTF-8 解析器，保留 Oxc/Babel 兼容处理。
    const surrogate = /[\uD800-\uDFFF]/u.test(source) || source.includes('\\ud800') || source.includes('\\udc00')
    if (!expected || surrogate) {
      assert.equal(direct, null, `Expected native compatibility fallback: ${label}`)
      compatibleFallbacks++
    }
    else {
      assert.ok(direct, `Unexpected native fallback: ${label}`)
      assert.deepEqual(direct, expected, `Native facts: ${label}`)
    }
    assert.deepEqual(getOxcSourceAnalysis(source, options), expected, `Integrated analysis: ${label}`)
    const output = oxcJsHandler(source, options)
    assert.deepEqual(output, withMode('off', () => oxcJsHandler(source, options)), `Integrated output: ${label}`)
    if (output) {
      assert.equal(output.code, jsHandler(source, options).code, `Babel output: ${label}`)
    }
    assert.equal(createJsHandler(options)(source, classNames, options).code, jsHandler(source, options).code, `Public handler: ${label}`)
    cases++
  }

  const corpus = createInput()
  const largeSource = corpus.sourceFor(0)
  const largeOptions = { ...base, filename: 'large.js' }
  const expectedFacts = withMode('off', () => getOxcSourceAnalysis(largeSource, largeOptions))
  assert.ok(expectedFacts)
  assert.deepEqual(compiler.analyzeJs(largeSource, 'js', 'module', false), expectedFacts)
  const expectedLargeOutput = jsHandler(largeSource, largeOptions)
  assert.equal(expectedLargeOutput.error, undefined, 'The Babel reference must parse the complete module')
  assert.equal(oxcJsHandler(largeSource, largeOptions)?.code, expectedLargeOutput.code)

  for (const source of new Set([...javascriptCases, ...typescriptCases, ...jsxCases, largeSource])) {
    const expected = withMode('off', () => tryCreateJsRuntimeAffectingSignature(source))
    const direct = compiler.jsRuntimeSignature(source)
    const surrogate = /[\uD800-\uDFFF]/u.test(source) || source.includes('\\ud800') || source.includes('\\udc00')
    if (expected !== undefined && !surrogate) {
      assert.notEqual(direct, null, `Unexpected signature fallback: ${source.slice(0, 240)}`)
      assert.equal(direct, expected, `Native signature: ${source.slice(0, 240)}`)
    }
    else {
      assert.equal(direct, null)
    }
    assert.equal(tryCreateJsRuntimeAffectingSignature(source), expected, `Integrated signature: ${source.slice(0, 240)}`)
  }

  for (const options of [
    { generateMap: true },
    { ignoreCallExpressionIdentifiers: ['keep'] },
    { ignoreTaggedTemplateExpressionIdentifiers: ['keep'] },
  ]) {
    const source = 'const a = keep("w-[10px]"); const b = keep`h-[20px]`; const c = "p-[3px]"'
    const current = { ...base, ...options, filename: 'fallback.js' }
    const handler = createJsHandler(current)
    assert.equal(handler(source, classNames, current).code, jsHandler(source, current).code)
  }
  assert.ok(nativeAnalyses > cases, 'Integrated paths must invoke the real native binding')
  assert.ok(nativeSignatures > 0)
  process.stdout.write(`${JSON.stringify({ node: process.version, cases, compatibleFallbacks, nativeAnalyses, nativeSignatures, input: { bytes: corpus.utf8Bytes, sha256: corpus.sha256 } })}\n`)
}
finally {
  compiler.analyzeJs = analyze
  compiler.jsRuntimeSignature = signature
}
