import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { cp, readFile, realpath, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { parse, parseAllDocuments, stringify } from 'yaml'
import { repo } from '../../../scripts/ci/demo-matrix/catalog.mjs'
import { run } from './process.mjs'
import { assertRegistryGraph } from './lock.mjs'
import { diagnosticPackages } from './profiling.mjs'

const fields = ['dependencies', 'devDependencies', 'optionalDependencies']
// uni-app 保留符号链接；采用 npm 兼容的扁平安装布局，避免传递依赖从符号链接路径解析失败。
export const installationLayout = item => item.family === 'uni' ? 'hoisted' : 'isolated'
export const hash = value => createHash('sha256').update(value).digest('hex')
export function parseLock(text) {
  const documents = parseAllDocuments(text)
  for (const document of documents) if (document.errors.length) throw document.errors[0]
  const lock = documents.at(-1)?.toJSON()
  assert.ok(lock?.importers && lock?.packages && lock?.snapshots, '锁文件缺少依赖图')
  return lock
}
export const inside = (root, file, paths = path) => {
  const relative = paths.relative(paths.resolve(root), paths.resolve(file))
  return relative === '' || (!paths.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${paths.sep}`))
}

export async function resolvePublished(spec = 'latest', cwd = repo) {
  assert.match(spec, /^(?:latest|\d+\.\d+\.\d+(?:-[\w.-]+)?)$/, '需要 latest 或确切版本')
  const result = await run('pnpm', ['view', `weapp-tailwindcss@${spec}`, '--json'], { cwd })
  const metadata = JSON.parse(result.stdout)
  assert.match(metadata.version, /^\d+\.\d+\.\d+/)
  assert.ok(metadata.dist?.integrity && metadata.dist?.tarball, '发布包缺少完整性信息')
  return { name: 'weapp-tailwindcss', version: metadata.version, integrity: metadata.dist.integrity, tarball: metadata.dist.tarball, engines: metadata.engines, resolvedAt: new Date().toISOString() }
}

export async function consumerManifest(item, published) {
  const original = JSON.parse(await readFile(path.join(repo, 'demo', item.name, 'package.json'), 'utf8'))
  const workspace = parse(await readFile(path.join(repo, 'pnpm-workspace.yaml'), 'utf8'))
  const lock = parseLock(await readFile(path.join(repo, 'pnpm-lock.yaml'), 'utf8'))
  const importer = lock.importers[`demo/${item.name}`]
  assert.ok(importer, `锁文件没有 ${item.name}`)
  const manifest = { ...original, scripts: Object.fromEntries(Object.entries(original.scripts ?? {}).filter(([key]) => !/^pre(?:build|dev)/.test(key))) }
  for (const field of fields) {
    manifest[field] = {}
    for (const [name, spec] of Object.entries(original[field] ?? {})) {
      if (diagnosticPackages.includes(name)) continue
      const resolved = importer[field]?.[name]?.version
      if (name === 'weapp-tailwindcss') manifest[field][name] = published.version
      else if (spec.startsWith('workspace:')) {
        const local = JSON.parse(await readFile(path.resolve(repo, 'demo', item.name, resolved.slice('link:'.length), 'package.json'), 'utf8'))
        manifest[field][name] = local.version
      }
      else {
        assert.ok(resolved && !/^(?:link:|file:)/.test(resolved), `不支持本地依赖 ${name}`)
        const version = resolved.split('(')[0]
        manifest[field][name] = spec.startsWith('npm:') ? `npm:${version}` : version
      }
    }
  }
  delete manifest.pnpm
  const rootManifest = JSON.parse(await readFile(path.join(repo, 'package.json'), 'utf8'))
  manifest.packageManager = rootManifest.packageManager
  return { manifest, workspace, sourceLock: lock, importer }
}

export function withoutIntegration(manifest, { authored = false } = {}) {
  const result = structuredClone(manifest)
  const removed = authored ? ['weapp-style-injector'] : ['weapp-tailwindcss', 'tailwindcss', '@tailwindcss/postcss', '@tailwindcss/vite', '@iconify/tailwind4', '@iconify-json/mdi', '@iconify-json/svg-spinners', 'tailwindcss-config', '@tailwindcss/typography', '@tailwindcss/forms', 'tailwindcss-animate']
  for (const field of fields) for (const name of removed) delete result[field]?.[name]
  return result
}

export async function writeConsumer(root, manifest, workspace) {
  await writeFile(path.join(root, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  // 复用仓库已有的发布元数据纠正，三组一致；不修改包版本、完整性或平台检测结果。
  await cp(path.join(repo, '.pnpmfile.cjs'), path.join(root, '.pnpmfile.cjs'))
  // 安装策略来自仓库，路径补丁只作用于隔离消费目录中的独立副本。
  await writeFile(path.join(root, 'pnpm-workspace.yaml'), stringify({ packages: ['.'], nodeLinker: workspace.nodeLinker ?? 'isolated', allowBuilds: workspace.allowBuilds, minimumReleaseAge: 0, autoInstallPeers: true }))
  // 不能带入 workspace 的 peer 快照：其中的可选 peer 会把无关框架安装到消费项目。
  // 共有直接依赖已固定确切版本；独立解析后校验共有构建工具并保存完整锁文件。
}

export async function assertPublished(root, published) {
  root = await realpath(root)
  const require = createRequire(path.join(root, 'package.json'))
  const file = await realpath(require.resolve('weapp-tailwindcss/package.json'))
  assert.ok(inside(root, file), `解析到了消费目录以外的包：${file}`)
  const manifest = JSON.parse(await readFile(file, 'utf8'))
  assert.equal(manifest.version, published.version, '实际安装版本不符')
  const text = await readFile(path.join(root, 'pnpm-lock.yaml'), 'utf8')
  const lock = parseLock(text)
  assert.equal(lock.packages[`weapp-tailwindcss@${published.version}`]?.resolution?.integrity, published.integrity, '锁文件包完整性不符')
  assertRegistryGraph(lock)
  return { version: manifest.version, lockHash: hash(text), resolution: path.relative(root, file), packageCount: Object.keys(lock.packages).length }
}
