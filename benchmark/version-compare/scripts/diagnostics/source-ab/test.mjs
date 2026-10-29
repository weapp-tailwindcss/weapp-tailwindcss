import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import test from 'node:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import vm from 'node:vm'
import { createRequire } from 'node:module'
import ts from 'typescript'
import { sha256 } from './identity.mjs'
import { instrumentSource } from './instrument.mjs'
import { refs } from './prepare.mjs'
import { verifyProductEvidence } from './product-evidence.mjs'

const { install, symbol } = createRequire(import.meta.url)('./product-observer.cjs')

test('无分号对象声明后的插桩保持独立语句并实际执行', async () => {
  const source = `async function main() {
    const compilation = {}, runtimeSet = new Set(), transformRuntimeSet = new Set(), generatorRuntimeSet = new Set()
    const webpackSourceCandidateSet = new Set(), cssSources = new Map(), generatedCssSources = new Map(), groupedEntries = {}
    const htmlTaskFactories = [], jsTaskFactories = [], cssTaskFactories = []
    const preparedCssTaskContext = { compilation }
    enqueueWebpackHtmlAndJsTasks(preparedCssTaskContext)
    const taskContext = { compilation }
    await finalizeWebpackProcessAssets(taskContext)
    const shadowContext = { compilation }
    await finalizeCompilerShadowRun(shadowContext)
    return preparedCssTaskContext
  }
  main()`
  const result = instrumentSource(source, 'v5-assets.ts')
  const events = []
  const actual = await vm.runInNewContext(ts.transpileModule(result.source, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, {
    Symbol,
    [symbol]: { sets: phase => events.push(phase), tasks: () => events.push('tasks') },
    enqueueWebpackHtmlAndJsTasks: () => events.push('enqueue'),
    finalizeWebpackProcessAssets: async () => events.push('finalize'),
    finalizeCompilerShadowRun: async () => events.push('shadow'),
  })
  assert.ok(actual.compilation)
  assert.deepEqual(events, ['before-tasks', 'enqueue', 'tasks', 'finalize', 'after-tasks', 'shadow'])
})

test('handler 插桩在无分号结果声明后配对完成并覆盖 skip', async () => {
  const source = `async function main() {
    const compilation = {}, file = 'entry.js', transformRuntimeSet = new Set()
    const readRawSource = () => 'raw'
    const compilerOptions = { templateHandler: async value => 'html:' + value, jsHandler: async value => 'js:' + value }
    const wxml = await compilerOptions.templateHandler(readRawSource())
    const currentSource = 'current'
    if (shouldSkipJsTransform()) {
      return currentSource
    }
    const code = await compilerOptions.jsHandler(currentSource)
    return { wxml, code }
  }
  main()`
  const result = instrumentSource(source, 'html-js-tasks.ts')
  for (const skip of [false, true]) {
    const events = [], pending = new Map()
    let nextId = 0
    const actual = await vm.runInNewContext(ts.transpileModule(result.source, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, {
      Symbol,
      [symbol]: {
        input: (kind, file, value) => { const id = ++nextId; pending.set(id, kind); events.push(['input', kind, value]); return id },
        output: (id, kind, file, value, compilation, skipped = false) => { assert.equal(pending.get(id), kind); pending.delete(id); events.push(['output', kind, value, skipped]) },
      },
      shouldSkipJsTransform: () => skip,
    })
    assert.equal(pending.size, 0)
    assert.deepEqual(events, [['input', 'html', 'raw'], ['output', 'html', 'html:raw', false], ['input', 'js', 'current'], ['output', 'js', skip ? 'current' : 'js:current', skip]])
    assert.equal(skip ? actual : actual.code, skip ? 'current' : 'js:current')
  }
})

for (const [role, ref] of Object.entries(refs)) {
  for (const relative of [
    'packages/weapp-tailwindcss/src/bundlers/webpack/BaseUnifiedPlugin/v5-assets.ts',
    'packages/weapp-tailwindcss/src/bundlers/webpack/BaseUnifiedPlugin/v5-assets/html-js-tasks.ts',
  ]) {
    test(`准确 ${role} ${relative} AST 锚点与语法`, () => {
      const source = execFileSync('git', ['show', `${ref}:${relative}`], { encoding: 'utf8' })
      const result = instrumentSource(source, relative)
      assert.notEqual(result.receipt.originalSha256, result.receipt.instrumentedSha256)
      assert.ok(result.receipt.edits.length >= 3)
      assert.throws(() => instrumentSource(result.source, relative), /拒绝重复插桩/)
      assert.throws(() => instrumentSource(source.replaceAll('compilerOptions.jsHandler', 'missingHandler').replaceAll('enqueueWebpackHtmlAndJsTasks', 'missingEnqueue'), relative), /锚点必须唯一/)
    })
  }
}

function productFixture(action) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'taro-product-evidence-'))
  fs.mkdirSync(path.join(directory, 'bytes'))
  const records = []
  try {
    const archive = { store(contents, digest) {
      assert.equal(sha256(contents), digest)
      const file = path.join('bytes', `${digest}.bin`)
      fs.writeFileSync(path.join(directory, file), contents)
      return { file, sha256: digest, bytes: contents.length }
    } }
    const observer = install({ write: (type, detail) => records.push({ type, ...detail }), archive })
    const compiler = { key: 'webpack@5.91.0', directory: 'fixture' }
    const compilation = {}, child = {}
    for (const [object, number, isChild] of [[compilation, 1, false], [child, 2, true]]) {
      observer.created(object, { number, child: isChild, compiler })
      records.push({ type: 'compiler-options', number, child: isChild, compiler })
    }
    const classes = new Set(['bg-red-500'])
    const sets = { compilation, runtime: classes, transform: classes, generator: classes, sourceCandidates: classes, sources: new Map([['source.css', { css: '.source-only{}' }]]), loaders: new Map([['loader.css', { classSet: classes, css: '.loader-only{}', dependencies: ['source.css'] }]]), grouped: { html: [], js: [['entry.js', 'unused']], css: [['style.css', 'unused']] } }
    observer.sets('before-tasks', sets)
    observer.tasks(0, 1, 1, compilation)
    const callId = observer.input('js', 'entry.js', 'const a=1', classes, compilation)
    observer.output(callId, 'js', 'entry.js', 'const a=1;', compilation)
    observer.sets('after-tasks', sets)
    observer.finish()
    action({ records, directory, observer, classes, compilation, child })
  }
  finally { delete globalThis[symbol]; fs.rmSync(directory, { recursive: true, force: true }) }
}

test('产品调用与独有来源、loader 正文均完整实读', () => productFixture(({ records, directory }) => {
  assert.deepEqual(verifyProductEvidence(records, directory), { compilations: 1, calls: 1, verifiedBodies: 4 })
}))

test('缓存命中任务不强制产生 transform 调用', () => productFixture(({ records, directory }) => {
  for (const record of records.filter(item => item.event === 'sets')) record.assets.js.push('cached.js')
  records.find(item => item.event === 'task-count').js = 2
  assert.equal(verifyProductEvidence(records, directory).calls, 1)
}))

test('拒绝跨 compilation 的同名文件调用输出', () => productFixture(({ records, directory }) => {
  const output = records.find(item => item.event === 'handler-output')
  output.compilation = { ...output.compilation, number: 2, child: true }
  assert.throws(() => verifyProductEvidence(records, directory), /边界|跨 compilation/)
}))

test('拒绝重复调用掩盖缺失输入', () => productFixture(({ records, directory }) => {
  const index = records.findIndex(item => item.event === 'handler-input')
  records.splice(index, 0, records[index])
  assert.throws(() => verifyProductEvidence(records, directory), /重复调用 ID/)
}))

test('拒绝未进入 phase 资产的来源正文损坏', () => productFixture(({ records, directory }) => {
  const receipt = records.find(item => item.event === 'sets').sources[0].body
  fs.writeFileSync(path.join(directory, receipt.file), 'corrupt')
  assert.throws(() => verifyProductEvidence(records, directory), /实读长度|实读摘要/)
}))

test('拒绝仅 loader 使用的正文缺失', () => productFixture(({ records, directory }) => {
  const receipt = records.find(item => item.event === 'sets').loaders[0].body
  fs.unlinkSync(path.join(directory, receipt.file))
  assert.throws(() => verifyProductEvidence(records, directory), /ENOENT/)
}))

test('observer 自身拒绝跨 compilation、重复完成与未完成调用', () => productFixture(({ observer, classes, compilation, child }) => {
  const id = observer.input('js', 'entry.js', 'const b=2', classes, compilation)
  assert.throws(() => observer.output(id, 'js', 'entry.js', 'const b=2;', child), /身份不匹配/)
  assert.throws(() => observer.finish(), /未完成/)
  observer.output(id, 'js', 'entry.js', 'const b=2;', compilation)
  assert.throws(() => observer.output(id, 'js', 'entry.js', 'const b=2;', compilation), /身份不匹配/)
  observer.finish()
}))
