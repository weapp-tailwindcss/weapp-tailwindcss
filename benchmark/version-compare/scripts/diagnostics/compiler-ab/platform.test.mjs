import assert from 'node:assert/strict'
import test from 'node:test'
import { matchesPlatform, platformMatches } from './installed-graph.mjs'

// 来自 run 40908914531 两侧已核验锁的真实 Sass 1.106.1 约束，保留原标量形态。
const sass = [
  { id: 'sass-embedded-linux-x64@1.106.1', os: ['linux'], cpu: ['x64'], libc: 'glibc' },
  { id: 'sass-embedded-linux-musl-x64@1.106.1', os: ['linux'], cpu: ['x64'], libc: 'musl' },
]

test('真实 Sass 标量 libc 在 Linux/glibc 与 Linux/musl 精确选择，metadata 保持原样', () => {
  const before = JSON.stringify(sass)
  for (const metadata of sass) {
    for (const libc of ['glibc', 'musl']) {
      const host = { os: 'linux', cpu: 'x64', libc }
      assert.equal(matchesPlatform(metadata, host), metadata.libc === libc, metadata.id)
      assert.equal(matchesPlatform({ ...metadata, libc: [metadata.libc] }, host), metadata.libc === libc)
      assert.equal(matchesPlatform({ ...metadata, libc: `!${metadata.libc}` }, host), metadata.libc !== libc)
    }
    assert.equal(matchesPlatform(metadata, { os: 'linux', cpu: 'arm64', libc: metadata.libc }), false)
    assert.equal(matchesPlatform(metadata, { os: 'darwin', cpu: 'x64', libc: undefined }), false)
    assert.equal(matchesPlatform(metadata, { os: 'win32', cpu: 'x64', libc: undefined }), false)
  }
  assert.equal(JSON.stringify(sass), before, '匹配不得把标量改写为数组或改变锁 metadata')
})

test('缺省、空数组、空字符串和 any 保持固定 pnpm 的不同匹配含义', () => {
  for (const field of ['os', 'cpu', 'libc']) {
    assert.equal(platformMatches(undefined, 'linux', field), true)
    assert.equal(platformMatches([], 'linux', field), true)
    assert.equal(platformMatches(['any'], 'linux', field), true)
    assert.equal(platformMatches(['any', 'darwin'], 'linux', field), false)
    assert.equal(platformMatches(['any', 'linux'], 'linux', field), true)
    assert.equal(platformMatches([''], 'linux', field), false)
  }
  assert.equal(platformMatches('', 'glibc', 'libc'), false)
  assert.equal(platformMatches('any', 'musl', 'libc'), true)
})

test('平台有序正向/否定匹配与固定 pnpm 源码一致，不把 any 混合列表放行', () => {
  assert.equal(platformMatches(['linux', '!linux'], 'linux', 'os'), true)
  assert.equal(platformMatches(['!linux', 'linux'], 'linux', 'os'), false)
  assert.equal(platformMatches(['!darwin'], 'linux', 'os'), true)
  assert.equal(platformMatches(['!darwin', 'win32'], 'linux', 'os'), false)
  assert.equal(platformMatches(['any', '!darwin'], 'linux', 'os'), false)
  assert.equal(platformMatches('glibc', 'musl', 'libc'), false)
  assert.equal(platformMatches('!glibc', 'musl', 'libc'), true)
})

test('os/cpu 仍要求数组；未知 libc 形态及混合成员明确失败而非当作无约束', () => {
  for (const field of ['os', 'cpu']) assert.throws(() => platformMatches('linux', 'linux', field), /约束格式无效/)
  for (const value of [null, 0, false, {}, { length: 0 }, [null], ['glibc', 1], [['musl']]]) {
    assert.throws(() => platformMatches(value, 'glibc', 'libc'), /约束格式无效/)
  }
})
