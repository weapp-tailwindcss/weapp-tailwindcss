import { expect, it } from 'vitest'
import { hasPollingReplacementReceipt } from './rollup-polling-receipt.mjs'

function fixture() {
  // 保留 Linux CI 的精确采样顺序：rename 先改变旧 inode 的 ctime，构建读取再推进新文件 atime。
  const before = { dev: 36, ino: 1634, size: 11, mtimeMs: 946684800000, ctimeMs: 1792835227453.0366, atimeMs: 1792835227460.0366 }
  const after = { dev: 36, ino: 1635, size: 11, mtimeMs: 946684800000, ctimeMs: 1792835227477.0366, atimeMs: 946684800000 }
  const intermediate = { ...before, ctimeMs: after.ctimeMs }
  const identity = stats => ({ exact: { dev: String(stats.dev), ino: String(stats.ino) } })
  const probe = { ...before, mtimeMs: 946684801000, ctimeMs: 1792835227442.0366, atimeMs: 946684800000 }
  return {
    before,
    after,
    identities: { before: identity(before), staged: identity(after), published: identity(after) },
    rawOffset: 2,
    raw: [
      { prev: { ...before, mtimeMs: 946684799000, ctimeMs: 1792835227404.0364, atimeMs: 1792835227418.0364 }, curr: probe },
      { prev: probe, curr: { ...before, atimeMs: 946684800000 } },
      { prev: before, curr: intermediate },
      { prev: intermediate, curr: { ...after, atimeMs: 1792835227482.0369 } },
    ],
    output: { default: 6, observedMtime: after.mtimeMs },
    expectedOutput: 6,
  }
}

it('Linux rename 的旧 inode ctime 中间采样与构建读取推进 atime 仍证明实际替换', () => {
  expect(hasPollingReplacementReceipt(fixture())).toBe(true)
})

it('一次直接采样也必须同时具备发布身份与真实产物', () => {
  const input = fixture()
  input.raw = [{ prev: input.before, curr: input.after }]
  input.rawOffset = 0
  expect(hasPollingReplacementReceipt(input)).toBe(true)
})

it('发布后与采样前的读取可以分别推进 atime，不改变旧到新文件的身份链', () => {
  const input = fixture()
  input.after.atimeMs += 1000
  input.raw[2].prev = { ...input.before, atimeMs: input.before.atimeMs + 500 }
  expect(hasPollingReplacementReceipt(input)).toBe(true)
})

it.each(['ctimeMs', 'atimeMs'])('只有 %s 变化的 raw 不能充当新文件采样', (field) => {
  const input = fixture()
  input.raw = [{ prev: input.before, curr: { ...input.before, [field]: input.before[field] + 1 } }]
  input.rawOffset = 0
  expect(hasPollingReplacementReceipt(input)).toBe(false)
})

it('旧 inode 的 ctime 已变为发布时刻也不能替代新 inode 的采样', () => {
  const input = fixture()
  input.raw.pop()
  expect(hasPollingReplacementReceipt(input)).toBe(false)
})

it.each(['dev', 'ino', 'size', 'mtimeMs', 'ctimeMs'])('新文件采样的 %s 不符合已发布快照时拒绝', (field) => {
  const input = fixture()
  input.raw.at(-1).curr[field]++
  expect(hasPollingReplacementReceipt(input)).toBe(false)
})

it.each(['dev', 'ino', 'size', 'mtimeMs', 'ctimeMs'])('旧文件采样的 %s 不能脱离上次采样凭据', (field) => {
  const input = fixture()
  input.raw.at(-1).prev = { ...input.raw.at(-1).prev, [field]: input.raw.at(-1).prev[field] + 1 }
  expect(hasPollingReplacementReceipt(input)).toBe(false)
})

it('预热或替换之前的 raw 回执不能证明本轮替换', () => {
  const input = fixture()
  input.rawOffset = input.raw.length
  expect(hasPollingReplacementReceipt(input)).toBe(false)
})

it('丢失旧 inode 中间采样时不能凭空拼接前后状态', () => {
  const input = fixture()
  input.raw.splice(2, 1)
  expect(hasPollingReplacementReceipt(input)).toBe(false)
})

it.each([0, 8, undefined])('正确身份与 raw 不能放行旧内容或错误构建内容 %s', (value) => {
  const input = fixture()
  input.output.default = value
  expect(hasPollingReplacementReceipt(input)).toBe(false)
})

it('产物仍来自预热 mtime 时不能放行', () => {
  const input = fixture()
  input.output.observedMtime++
  expect(hasPollingReplacementReceipt(input)).toBe(false)
})

it.each(['size', 'mtimeMs'])('发布时改变 %s 不能冒充等长且同 mtime 的替换', (field) => {
  const input = fixture()
  input.after[field]++
  expect(hasPollingReplacementReceipt(input)).toBe(false)
})

it('数值采样不能使用与精确发布身份无关的其他 inode', () => {
  const input = fixture()
  input.after.ino++
  expect(() => hasPollingReplacementReceipt(input)).toThrow('精确发布身份')
})

it('精确身份未变化或发布到了其他 inode 时，即使 raw 与产物相符也拒绝', () => {
  const unchanged = fixture()
  unchanged.identities.staged = unchanged.identities.before
  unchanged.identities.published = unchanged.identities.before
  expect(() => hasPollingReplacementReceipt(unchanged)).toThrow('新旧文件')
  const wrong = fixture()
  wrong.identities.published = wrong.identities.before
  expect(() => hasPollingReplacementReceipt(wrong)).toThrow('发布后的目标')
})

it('Number inode 碰撞时仍由不同 BigInt 发布身份、采样与实际产物联合证明', () => {
  const input = fixture()
  const previous = 9007199254740992n
  const published = 9007199254740993n
  expect(Number(previous)).toBe(Number(published))
  input.before.ino = Number(previous)
  input.after.ino = Number(published)
  input.identities.before.exact.ino = String(previous)
  input.identities.staged.exact.ino = String(published)
  input.identities.published.exact.ino = String(published)
  input.raw = [{ prev: input.before, curr: input.after }]
  input.rawOffset = 0
  expect(hasPollingReplacementReceipt(input)).toBe(true)
  input.output.default = 0
  expect(hasPollingReplacementReceipt(input)).toBe(false)
})
