const assert = require('node:assert/strict')
const { Buffer } = require('node:buffer')
const { createHash } = require('node:crypto')
const { performance } = require('node:perf_hooks')
const process = require('node:process')

const symbol = Symbol.for('weapp-tailwindcss.source-ab.v1')
const hash = value => createHash('sha256').update(value).digest('hex')

function install({ write, archive }) {
  assert.equal(globalThis[symbol], undefined, '产品诊断 observer 重复注册')
  const candidates = value => {
    assert.ok(value instanceof Set, '候选必须是既有 Set')
    assert.ok(value.size <= 100000, '候选超过完整取证上限')
    const all = [...value].sort()
    assert.ok(all.every(item => typeof item === 'string'), '候选类型不符')
    return { count: all.length, sha256: hash(JSON.stringify(all)), values: all }
  }
  const text = value => {
    assert.equal(typeof value, 'string', '正文必须复用已读取字符串')
    const bytes = Buffer.from(value)
    const sha256 = hash(bytes)
    return archive.store(bytes, sha256)
  }
  const record = (event, create) => {
    const memory = process.memoryUsage()
    const started = performance.now()
    const detail = create()
    write('product', { event, memory, ...detail, evidenceCostMs: performance.now() - started, memoryAfterEvidence: process.memoryUsage() })
  }
  globalThis[symbol] = {
    sets(phase, detail) {
      record('sets', () => ({
        phase,
        runtime: candidates(detail.runtime), transform: candidates(detail.transform), generator: candidates(detail.generator),
        sourceCandidates: detail.sourceCandidates === undefined ? undefined : candidates(detail.sourceCandidates),
        sources: [...detail.sources].map(([file, value]) => ({ file, body: text(value.css) })),
        loaders: [...detail.loaders].map(([file, value]) => ({ file, classes: candidates(value.classSet), body: text(value.css), dependencies: [...value.dependencies] })),
        assets: Object.fromEntries(Object.entries(detail.grouped).map(([kind, values]) => [kind, values.map(([file]) => file)])),
      }))
    },
    input(kind, file, code, classes) {
      record('handler-input', () => ({ kind, file, body: text(code), classes: candidates(classes) }))
    },
    output(kind, file, code, skipped = false) {
      record('handler-output', () => ({ kind, file, body: text(code), skipped }))
    },
    tasks(html, js, css) {
      record('task-count', () => ({ html, js, css }))
    },
  }
}

module.exports = { install, symbol }
