import fs from 'node:fs/promises'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { createUniDependencyObserver } from '../scripts/diagnostics/uni-dependencies.mjs'
import { sha256 } from '../scripts/diagnostics/evidence.mjs'

const roots = []
const require = createRequire(import.meta.url)
afterEach(async () => {
  delete globalThis.__uniNeverLoad
  for (const root of roots.splice(0)) {
    for (const filename of Object.keys(require.cache)) if (path.relative(root, filename).startsWith(`node_modules${path.sep}`)) delete require.cache[filename]
    await fs.rm(root, { recursive: true, force: true })
  }
})
async function packageFixture(root, name, source, extension) {
  const directory = path.join(root, 'node_modules', name)
  await fs.mkdir(directory, { recursive: true })
  await fs.writeFile(path.join(directory, 'package.json'), JSON.stringify({ name, version: '1.2.3', main: `index.${extension}` }))
  const file = path.join(directory, `index.${extension}`)
  await fs.writeFile(file, source)
  return file
}

it('真实 CJS 已加载缓存与 ESM resolve 分开，不触发未加载依赖执行', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'uni-physical-'))
  roots.push(root)
  const source = 'module.exports = { value: 1 }'
  const cjs = await packageFixture(root, 'postcss', source, 'cjs')
  const esm = await packageFixture(root, 'vite', 'globalThis.__uniNeverLoad = true; export default 1', 'mjs')
  const anchored = createRequire(path.join(root, 'package.json'))
  expect(anchored('postcss')).toEqual({ value: 1 })
  const result = createUniDependencyObserver({ root }).snapshot()
  expect(result.loaded).toContainEqual(expect.objectContaining({ evidence: 'loaded-cjs-cache', name: 'postcss', fileSha256AtObservation: sha256(source), physicalFile: await fs.realpath(cjs) }))
  expect(result.resolved).toContainEqual(expect.objectContaining({ specifier: 'vite', evidence: 'resolved-only', physicalFile: await fs.realpath(esm), loaded: 'unknown', loadedByCjsCache: false }))
  expect(result.resolved).toContainEqual(expect.objectContaining({ specifier: 'postcss', loaded: 'proven-cjs-cache', loadedByCjsCache: true }))
  expect(result.missingEvidence).toContainEqual(expect.objectContaining({ specifier: 'vite' }))
  expect(globalThis.__uniNeverLoad).toBeUndefined()
})

it('只有 loaded=true 的真实 Module 可作为已加载证据，超量枚举失败', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'uni-physical-unknown-'))
  roots.push(root)
  const file = await packageFixture(root, 'postcss', 'module.exports = 1', 'cjs')
  const result = createUniDependencyObserver({ root, moduleCache: { fake: { filename: file, loaded: false } } }).snapshot()
  expect(result.loaded).toEqual([])
  expect(result.resolved.find(item => item.specifier === 'postcss').loaded).toBe('unknown')
  const oversized = Object.fromEntries(Array.from({ length: 8193 }, (_, index) => [index, {}]))
  expect(() => createUniDependencyObserver({ root, moduleCache: oversized }).snapshot()).toThrow('上限')
})
