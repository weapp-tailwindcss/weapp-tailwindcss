import assert from 'node:assert/strict'
import { assertPublishedIdentity } from './rollup-file-identity/fixture.mjs'

const stableFields = ['dev', 'ino', 'size', 'mtimeMs']
const snapshotFields = [...stableFields, 'ctimeMs']
const matches = (actual, expected, fields) => actual && fields.every(key => actual[key] === expected[key])

export function hasPollingReplacementReceipt({ before, after, identities, raw, rawOffset, output, expectedOutput }) {
  assertPublishedIdentity(identities.before.exact, identities.staged.exact, identities.published.exact)
  for (const [snapshot, identity] of [[before, identities.before], [after, identities.published]]) {
    for (const field of ['dev', 'ino']) {
      assert.equal(snapshot[field], Number(BigInt(identity.exact[field])), '采样快照必须对应已核对的精确发布身份')
    }
  }
  if (before.size !== after.size || before.mtimeMs !== after.mtimeMs
    || output?.default !== expectedOutput || output?.observedMtime !== after.mtimeMs) {
    return false
  }
  let previous = before
  for (const { curr, prev } of raw.slice(rawOffset)) {
    // rename 可能先改变旧 inode 的 ctime；每一步仍必须连接上一份真实采样。
    if (!matches(prev, previous, snapshotFields)) {
      return false
    }
    // atime 会被真实构建读取推进，不能作为已发布文件的稳定身份。
    if (matches(curr, after, snapshotFields)) {
      return true
    }
    if (!matches(curr, before, stableFields)) {
      return false
    }
    previous = curr
  }
  return false
}
