import { existsSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { prepareNativeSource } from '../../../../../scripts/release-nightly/native-inputs.mjs'
import { env, fixture, json, writeJson } from './fixture'

const roots: string[] = []
function setup() {
  const f = fixture()
  roots.push(f.root)
  return f
}
afterEach(() => roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })))

const filename = 'weapp-tailwindcss-native.darwin-arm64.node'
const sidecar = (input: string) => path.join(input, 'weapp-tailwindcss', 'native', 'bindings', 'native-input-darwin-arm64.json')
const binding = (input: string) => path.join(input, 'weapp-tailwindcss', 'native', 'bindings', filename)

it('验证全部十六个输入，仅重标元数据版本且保留二进制字节', () => {
  const f = setup()
  const before = readFileSync(binding(f.input))
  const receipt = prepareNativeSource(f.context, f.input, env)
  expect(receipt.files).toHaveLength(72)
  expect(new Set(receipt.files.map(item => item.path)).size).toBe(72)
  expect(receipt.metadata).toMatchObject({ commit: f.context.identity.commit, tree: f.context.tree, corePreviousVersion: '1.0.0', postcssPreviousVersion: '2.0.0' })
  const staged = path.join(f.source, 'packages-native', 'darwin-arm64')
  expect(readFileSync(path.join(staged, filename))).toEqual(before)
  expect(json(path.join(staged, 'native-metadata.json')).version).toBe('1.0.0-snapshot.nightly.fixture')
  expect(json(path.join(staged, 'postcss-native-metadata.json')).version).toBe('2.0.0-snapshot.nightly.fixture')
})

it.each(['commit', 'tree', 'runId', 'runAttempt', 'target', 'suffix', 'licenseSha256'])('错误生产者 %s 必须在任何复制前失败', (field) => {
  const f = setup()
  const file = sidecar(f.input)
  writeJson(file, { ...json(file), [field]: 'wrong' })
  expect(() => prepareNativeSource(f.context, f.input, env)).toThrow()
  expect(existsSync(path.join(f.source, 'packages-native', 'darwin-arm64', filename))).toBe(false)
})

it.each(['missing', 'binary', 'metadata', 'duplicate', 'source', 'version'])('拒绝 %s 输入且不产生部分输出', (failure) => {
  const f = setup()
  const file = sidecar(f.input)
  if (failure === 'missing') {
    unlinkSync(file)
  }
  else if (failure === 'binary') {
    writeFileSync(binding(f.input), 'tampered binary')
  }
  else if (failure === 'metadata') {
    writeFileSync(`${binding(f.input)}.json`, '{}')
  }
  else if (failure === 'duplicate') {
    const record = json(file)
    record.records = [record.records[0], record.records[0]]
    writeJson(file, record)
  }
  else if (failure === 'source') {
    writeFileSync(path.join(f.source, 'packages', 'postcss', 'native', 'src', 'lib.rs'), 'modified source')
  }
  else {
    f.context.packages[0].currentVersion = '0.0.1'
  }
  expect(() => prepareNativeSource(f.context, f.input, env)).toThrow()
  expect(existsSync(path.join(f.source, 'packages-native', 'darwin-arm64', filename))).toBe(false)
})

it('不接受符号链接替换已验证输入', () => {
  const f = setup()
  const original = binding(f.input)
  const external = path.join(f.root, 'external.node')
  writeFileSync(external, readFileSync(original))
  unlinkSync(original)
  symlinkSync(external, original)
  expect(() => prepareNativeSource(f.context, f.input, env)).toThrow('symbolic links')
})
