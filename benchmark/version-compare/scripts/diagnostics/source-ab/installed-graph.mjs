import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { readPackage, sha256 } from './package-identity.mjs'
import { packageName, target } from './lock-graph-core.mjs'

export function platformMatches(values, actual, field = 'platform') {
  if (values === undefined) return true
  // pnpm 12 的 libc 是 StringOrList；只在匹配边界建立单元素视图，不改原 metadata。
  const entries = field === 'libc' && typeof values === 'string' ? [values] : values
  assert.ok(Array.isArray(entries) && entries.every(value => typeof value === 'string'), `平台 ${field} 约束格式无效`)
  if (entries.length === 1 && entries[0] === 'any') return true
  // 与固定 pnpm 的有序匹配一致：首个匹配的正向或否定条目决定结果。
  for (const entry of entries) {
    if (entry === `!${actual}`) return false
    if (!entry.startsWith('!') && entry === actual) return true
  }
  return entries.every(value => value.startsWith('!'))
}

/** 平台选择保持纯函数，Linux libc 分支无需安装或伪装当前主机即可验证。 */
export function matchesPlatform(metadata, platform) {
  return Object.entries(platform).every(([field, actual]) => actual === undefined || platformMatches(metadata[field], actual, field))
}

/** 从预先批准的准确锁边验证安装图，不通过观测到的目录反推授权。 */
export function installedLockGraph(lock, seeds) {
  const bindings = new Map(), directories = new Map(), edges = []
  const platform = { os: process.platform, cpu: process.arch, libc: process.platform === 'linux' ? (process.report.getReport().header.glibcVersionRuntime ? 'glibc' : 'musl') : undefined }
  function visit(from, name, expected, route, optional = false) {
    assert.ok(!expected.local, '编译器安装闭包不接受本地引用')
    const metadata = lock.packages[expected.id]
    assert.ok(metadata, `缺少安装包源码 metadata：${expected.id}`)
    assert.equal(typeof metadata.resolution?.integrity, 'string', `缺少批准的包来源 SRI：${expected.id}`)
    if (optional && !matchesPlatform(metadata, platform)) {
      edges.push({ route, key: expected.key, unavailablePlatform: true })
      return
    }
    const actual = readPackage(from, name, packageName(expected.id))
    assert.equal(`${actual.name}@${actual.version}`, expected.id, `安装版本与批准锁边不符：${route}`)
    edges.push({ route, key: expected.key, directory: actual.directory })
    if (bindings.has(expected.key)) {
      assert.equal(actual.directory, bindings.get(expected.key).directory, `同一锁上下文解析到不同目录：${route}`)
      return actual
    }
    assert.ok(!directories.has(actual.directory), `不同锁上下文被安装图合并：${route}`)
    directories.set(actual.directory, expected.key)
    bindings.set(expected.key, { ...actual, key: expected.key, source: metadata.resolution, patch: lock.patchedDependencies?.[expected.id] ?? null })
    const snapshot = lock.snapshots[expected.key]
    for (const field of ['dependencies', 'optionalDependencies']) {
      for (const [dependency, reference] of Object.entries(snapshot[field] ?? {})) {
        visit(actual.directory, dependency, target(lock, dependency, reference), `${expected.key}.${field}.${dependency}`, field === 'optionalDependencies')
      }
    }
    return actual
  }
  for (const seed of seeds) visit(seed.from, seed.name, target(lock, seed.name, seed.reference), seed.route)
  return { platform, bindings: Object.fromEntries(bindings), edges }
}

/** 完整保留 npm 包文件，只排除包内依赖目录；JS/JSON 和隐藏文件都参与比较。 */
export function packageFiles(directory) {
  const files = {}
  function visit(current) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
      if (entry.name === 'node_modules' && entry.isDirectory()) continue
      const file = path.join(current, entry.name)
      assert.ok(!entry.isSymbolicLink(), `包源码不接受未核对的软链：${file}`)
      if (entry.isDirectory()) visit(file)
      else {
        assert.ok(entry.isFile(), `包源码包含非常规文件：${file}`)
        files[path.relative(directory, file)] = sha256(fs.readFileSync(file))
      }
    }
  }
  visit(directory)
  return files
}

export function sameCompilerSources(contexts) {
  assert.ok(contexts.length, '没有批准的编译器源码')
  const result = contexts.map(identity => ({ ...identity, files: packageFiles(identity.directory) }))
  for (const context of result) assert.deepEqual(context.files, result[0].files, '同侧 Webpack 完整源码或补丁内容不一致')
  return result
}
