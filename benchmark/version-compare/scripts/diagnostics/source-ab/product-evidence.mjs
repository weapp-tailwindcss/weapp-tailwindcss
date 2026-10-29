import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { sha256 } from './identity.mjs'

export function verifyProductEvidence(records, directory) {
  const root = fs.realpathSync(directory)
  const verified = new Map()
  const candidates = value => {
    assert.ok(Array.isArray(value?.values) && value.values.every(item => typeof item === 'string'), '候选全文缺失')
    assert.equal(value.count, value.values.length, '候选数量不符')
    assert.ok(value.count <= 100000, '候选全文超过上限')
    assert.equal(new Set(value.values).size, value.count, '候选存在重复')
    assert.deepEqual([...value.values].sort(), value.values, '候选顺序不符')
    assert.equal(sha256(JSON.stringify(value.values)), value.sha256, '候选全文摘要不符')
  }
  const body = receipt => {
    assert.match(receipt?.sha256 ?? '', /^[a-f\d]{64}$/, '产品正文摘要缺失')
    assert.ok(Number.isSafeInteger(receipt.bytes) && receipt.bytes >= 0 && receipt.bytes <= 32 * 1024 * 1024, '产品正文声明长度无效')
    assert.equal(receipt.file, path.join('bytes', `${receipt.sha256}.bin`), '产品正文路径不符')
    if (verified.has(receipt.sha256)) {
      assert.equal(receipt.bytes, verified.get(receipt.sha256), '重复正文回执长度不符')
      return
    }
    const file = path.join(root, receipt.file)
    assert.equal(fs.realpathSync(file), file, '产品正文不可跟随软链')
    const stat = fs.lstatSync(file)
    assert.ok(stat.isFile() && stat.size <= 32 * 1024 * 1024, '产品正文不是有界普通文件')
    const contents = fs.readFileSync(file)
    assert.equal(contents.length, receipt.bytes, '产品正文实读长度不符')
    assert.equal(sha256(contents), receipt.sha256, '产品正文实读摘要不符')
    verified.set(receipt.sha256, contents.length)
  }
  const options = new Map(records.filter(item => item.type === 'compiler-options').map(item => [item.number, item]))
  const products = records.filter(item => item.type === 'product')
  assert.ok(products.length, '缺少产品事件')
  const pending = new Map(), calls = new Set(), boundaries = new Map()
  for (const item of products) {
    const identity = item.compilation
    const actual = options.get(identity?.number)
    assert.ok(actual, '产品事件没有实际 compilation')
    assert.equal(actual.child, identity.child)
    assert.deepEqual(actual.compiler, identity.compiler)
    const state = boundaries.get(identity.number) ?? { before: false, after: false, tasks: false, expected: undefined }
    boundaries.set(identity.number, state)
    if (item.event === 'sets') {
      for (const set of [item.runtime, item.transform, item.generator]) candidates(set)
      if (item.sourceCandidates !== undefined) candidates(item.sourceCandidates)
      for (const source of item.sources) body(source.body)
      for (const loader of item.loaders) { body(loader.body); candidates(loader.classes) }
      if (item.phase === 'before-tasks') {
        assert.ok(!state.before && !state.after, '重复或乱序开始边界')
        state.before = true
        state.expected = item.assets
      }
      else {
        assert.equal(item.phase, 'after-tasks')
        assert.ok(state.before && state.tasks && !state.after, '重复或乱序完成边界')
        assert.ok(![...pending.values()].some(input => input.compilation.number === identity.number), 'compilation 完成时仍有未配对调用')
        state.after = true
      }
    }
    else {
      assert.ok(state.before && !state.after, '产品调用越过实际 compilation 候选边界')
      if (item.event === 'task-count') {
        assert.ok(!state.tasks, '重复任务登记')
        state.tasks = true
        assert.equal(item.html, state.expected.html.length, 'HTML 任务数量与实际分组不符')
        assert.equal(item.js, state.expected.js.length, 'JS 任务数量与实际分组不符')
      }
      else {
        assert.ok(['html', 'js'].includes(item.kind), '未知 handler 类型')
        assert.ok(state.expected[item.kind].includes(item.file), 'handler 文件不在该 compilation 的实际资产分组')
        assert.ok(Number.isSafeInteger(item.callId) && item.callId > 0, '调用 ID 缺失')
        body(item.body)
        if (item.event === 'handler-input') {
          assert.ok(!calls.has(item.callId), '重复调用 ID')
          calls.add(item.callId)
          candidates(item.classes)
          pending.set(item.callId, item)
        }
        else {
          assert.equal(item.event, 'handler-output')
          const input = pending.get(item.callId)
          assert.ok(input, '输出没有唯一先行输入')
          assert.equal(input.kind, item.kind)
          assert.equal(input.file, item.file)
          assert.deepEqual(input.compilation, item.compilation, '调用跨 compilation 配对')
          pending.delete(item.callId)
        }
      }
    }
  }
  assert.equal(pending.size, 0, '存在未完成 handler 调用')
  assert.ok(boundaries.size > 0 && [...boundaries.values()].every(value => value.before && value.tasks && value.after), 'compilation 产品边界缺证')
  return { compilations: boundaries.size, calls: calls.size, verifiedBodies: verified.size }
}
