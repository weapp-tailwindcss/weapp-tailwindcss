import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { lstatSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

const limit = 16 * 1024 * 1024
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')

export function receiptFiles(session) {
  const names = readdirSync(path.join(session.directory, 'events'))
  assert.ok(names.length <= 1024, '运行守卫收据文件超限')
  let bytes = 0
  return names.map((name) => {
    assert.equal(path.extname(name), '.ndjson', '运行守卫发现未知收据类型')
    const filename = path.join(session.directory, 'events', name)
    const stat = lstatSync(filename, { bigint: true })
    bytes += Number(stat.size)
    assert.ok(stat.isFile() && bytes <= limit, '运行守卫收据类型或总字节超限')
    return { name, filename, stat }
  })
}

export function readReceiptSnapshot(session, { final = false } = {}) {
  let total = 0
  const files = receiptFiles(session)
  return files.map(({ name, filename, stat }) => {
    const bytes = readFileSync(filename)
    total += bytes.length
    const after = lstatSync(filename, { bigint: true })
    assert.ok(total <= limit && stat.dev === after.dev && stat.ino === after.ino && after.isFile(), '运行守卫收据读取期间被替换或超限')
    if (final) assert.ok(after.size === BigInt(bytes.length), '运行守卫收据仍在写入')
    return { name, device: String(stat.dev), inode: String(stat.ino), bytes }
  })
}

export function receiptRecords(session, final = false, history = new Map()) {
  const records = []
  const files = readReceiptSnapshot(session, { final })
  assert.ok([...history.keys()].every(name => files.some(file => file.name === name)), '观察过的运行守卫收据被删除')
  for (const item of files) {
    const { name, bytes, device, inode } = item
    const previous = history.get(name)
    if (previous) assert.ok(previous.device === device && previous.inode === inode && bytes.length >= previous.bytes.length && bytes.subarray(0, previous.bytes.length).equals(previous.bytes), '观察过的运行守卫收据被替换、截断或改写')
    history.set(name, { device, inode, bytes })
    const source = bytes.toString('utf8')
    if (final) assert.ok(source.endsWith('\n'), '外部观察发现未完成收据')
    // 运行中只消费完整行；已见到的半行字节同样必须只追加，不能回退。
    const complete = source.slice(0, source.lastIndexOf('\n') + 1)
    for (const line of complete.trimEnd().split('\n').filter(Boolean)) {
      const entry = JSON.parse(line)
      assert.equal(entry.session, session.id, '外部观察会话身份不符')
      records.push(entry)
    }
  }
  return records
}

export function receiptSeal(history) {
  return [...history].map(([name, item]) => ({ name, device: item.device, inode: item.inode, bytes: item.bytes.length, sha256: sha256(item.bytes) })).sort((a, b) => a.name.localeCompare(b.name, 'en'))
}

export function verifyReceiptSeal(snapshot, expected) {
  assert.ok(Array.isArray(expected), '缺少最终运行守卫收据摘要')
  const history = new Map(snapshot.map(item => [item.name, item]))
  assert.deepEqual(receiptSeal(history), expected, '外部停止观察结束后运行守卫收据发生变化')
}
