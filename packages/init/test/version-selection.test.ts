import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { init } from '../src/index'
import { getLatestVersionInRange } from '../src/npm'

const registry = vi.hoisted(() => ({ versions: [] as string[] }))
vi.mock('npm-registry-fetch', () => ({
  json: vi.fn(async () => ({
    'dist-tags': { latest: '5.0.0' },
    'versions': Object.fromEntries(registry.versions.map(version => [version, {}])),
  })),
}))
const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => fs.rm(root, { recursive: true, force: true })))
})

it.each([
  [['4.2.0', '4.1.0'], '4.2.0'],
  [['4.2.0', '4.3.0-beta.1'], '4.2.0'],
  [['4.2.0', '40.0.0'], '4.2.0'],
  [['4.2.0', '4.invalid'], '4.2.0'],
])('选择范围内最高稳定版：%j', async (versions, expected) => {
  registry.versions = versions
  await expect(getLatestVersionInRange('example', '4')).resolves.toBe(expected)
})

it.each([{ versions: [] }, { versions: ['5.0.0'] }, { versions: ['4.3.0-beta.1'] }])('没有稳定匹配版本时拒绝回退：$versions', async ({ versions }) => {
  registry.versions = versions
  await expect(getLatestVersionInRange('example', '4')).rejects.toThrow(/example.*4/)
})

it('无效范围包含包名与范围诊断', async () => {
  registry.versions = ['4.2.0']
  await expect(getLatestVersionInRange('example', 'invalid')).rejects.toThrow(/example.*invalid/)
})

it.each(['v4', 'legacy'] as const)('依赖选择失败不部分写入 %s 项目', async (mode) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'weapp-init-version-'))
  roots.push(root)
  const pkg = path.join(root, 'package.json')
  const original = '{"name":"unchanged","devDependencies":{"custom":"1.0.0"}}\n'
  await fs.writeFile(pkg, original)
  registry.versions = ['99.0.0']
  await expect(init({ cwd: root, mode })).rejects.toThrow()
  expect(await fs.readFile(pkg, 'utf8')).toBe(original)
  expect(await fs.readdir(root)).toEqual(['package.json'])
})
