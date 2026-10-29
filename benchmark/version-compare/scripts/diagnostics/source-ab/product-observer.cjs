const assert = require('node:assert/strict')
const { Buffer } = require('node:buffer')
const { createHash } = require('node:crypto')
const { performance } = require('node:perf_hooks')
const process = require('node:process')

const symbol = Symbol.for('weapp-tailwindcss.source-ab.v1')
const hash = value => createHash('sha256').update(value).digest('hex')

function install({ write, archive }) {
  assert.equal(globalThis[symbol], undefined, '产品诊断 observer 重复注册')
  const compilations = new WeakMap()
  const pending = new Map()
  let nextCall = 0
  const compilationIdentity = compilation => {
    const identity = compilations.get(compilation)
    assert.ok(identity, '产品事件缺少真实 compilation 登记')
    return identity
  }
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
    created(compilation, identity) {
      assert.ok(!compilations.has(compilation), 'compilation 重复登记')
      compilations.set(compilation, identity)
    },
    sets(phase, detail) {
      record('sets', () => ({
        phase, compilation: compilationIdentity(detail.compilation),
        runtime: candidates(detail.runtime), transform: candidates(detail.transform), generator: candidates(detail.generator),
        sourceCandidates: detail.sourceCandidates === undefined ? undefined : candidates(detail.sourceCandidates),
        sources: [...detail.sources].map(([file, value]) => ({ file, body: text(value.css) })),
        loaders: [...detail.loaders].map(([file, value]) => ({ file, classes: candidates(value.classSet), body: text(value.css), dependencies: [...value.dependencies] })),
        assets: Object.fromEntries(Object.entries(detail.grouped).map(([kind, values]) => [kind, values.map(([file]) => file)])),
      }))
    },
    input(kind, file, code, classes, compilation) {
      const identity = { kind, file, compilation: compilationIdentity(compilation), callId: ++nextCall }
      pending.set(identity.callId, identity)
      record('handler-input', () => ({ ...identity, body: text(code), classes: candidates(classes) }))
      return identity.callId
    },
    output(callId, kind, file, code, compilation, skipped = false) {
      const identity = pending.get(callId)
      assert.deepEqual(identity, { kind, file, compilation: compilationIdentity(compilation), callId }, '调用输出身份不匹配')
      pending.delete(callId)
      record('handler-output', () => ({ ...identity, body: text(code), skipped }))
    },
    tasks(html, js, css, compilation) {
      record('task-count', () => ({ html, js, css, compilation: compilationIdentity(compilation) }))
    },
    finish() {
      assert.equal(pending.size, 0, '正常退出时仍有未完成 handler 调用')
    },
  }
  return globalThis[symbol]
}

module.exports = { install, symbol }
