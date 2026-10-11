import assert from 'node:assert/strict'
import { constants } from 'node:fs'
import { cp, mkdir, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { stringify } from 'yaml'
import { repo } from '../../../scripts/ci/demo-matrix/catalog.mjs'
import { consumerManifest, hash, inside, installationLayout, parseLock, withoutIntegration, writeConsumer } from './published.mjs'
import { run } from './process.mjs'
import { assertRegistryGraph, pruneLock } from './lock.mjs'
import { disableProfiling } from './profiling.mjs'
import { prepareFrameworkPatches } from './framework-patches.mjs'

export async function createConsumer(item, published, directory, mode) {
  await mkdir(directory, { recursive: true })
  directory = await realpath(directory)
  const root = path.join(directory, mode)
  const project = path.join(root, 'demo', item.name)
  await mkdir(project, { recursive: true })
  const listed = await run('git', ['ls-files', '-z', 'demo'], { cwd: repo })
  const prefix = `demo/${item.name}/`
  for (const entry of listed.stdout.split('\0').filter(Boolean)) {
    if (!entry.startsWith(prefix) && path.posix.dirname(entry) !== 'demo' && !entry.startsWith('demo/web/shared/')) continue
    const target = path.resolve(root, entry)
    assert.ok(inside(root, target), '复制范围越界')
    await mkdir(path.dirname(target), { recursive: true })
    await cp(path.resolve(repo, entry), target)
  }
  const inputs = await consumerManifest(item, published)
  await disableProfiling(root)
  const manifest = mode === 'enabled' || mode === 'prepare' ? inputs.manifest : withoutIntegration(inputs.manifest, { authored: item.name.startsWith('style-injector-') })
  // 仓库辅助计时不属于发布版默认体验，三组使用相同的关闭状态。
  for (const [key, value] of Object.entries(manifest.scripts ?? {})) manifest.scripts[key] = value.replaceAll('WEAPP_TW_HMR_TIMING=1', 'WEAPP_TW_HMR_TIMING=0')
  await writeConsumer(project, manifest, { ...inputs.workspace, nodeLinker: installationLayout(item) })
  await writeFile(path.join(project, '.npmrc'), 'strict-peer-dependencies=false\nauto-install-peers=true\n')
  await symlink(path.join(project, 'node_modules'), path.join(root, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir')
  return { root, project, mode, item }
}

export async function prepareLock(consumer, store, logDir) {
  await run('pnpm', ['install', '--lockfile-only', '--no-frozen-lockfile', '--store-dir', store], { cwd: consumer.project, logFile: path.join(logDir, `${consumer.mode}-resolve.log`) })
  const file = path.join(consumer.project, 'pnpm-lock.yaml')
  let parsed = parseLock(await readFile(file, 'utf8'))
  const patches = await prepareFrameworkPatches(consumer.project, parsed)
  if (Object.keys(patches).length) {
    await run('pnpm', ['install', '--lockfile-only', '--no-frozen-lockfile', '--store-dir', store], { cwd: consumer.project, logFile: path.join(logDir, `${consumer.mode}-patched-resolve.log`) })
    parsed = parseLock(await readFile(file, 'utf8'))
  }
  const source = stringify(pruneLock(parsed, parsed.importers['.']))
  await writeFile(file, source)
  assertRegistryGraph(parseLock(source))
  return { hash: hash(source), lock: parseLock(source) }
}

export async function seedPreparationStore(source, destination) {
  assert.ok(!inside(source, destination) && !inside(destination, source), '准备 store 必须是独立目录')
  // 只复制不计时准备阶段的已下载文件；不用硬链接，避免组间写入相互影响。
  // 正式安装测量始终自行创建空 store，不能调用此函数。
  await cp(source, destination, { recursive: true, mode: constants.COPYFILE_FICLONE })
}

export function compareCommonLocks(left, right) {
  const packages = lock => new Map(Object.entries(lock.packages ?? {}).map(([key, value]) => [key, value.resolution?.integrity]))
  const a = packages(left)
  const b = packages(right)
  for (const [name, integrity] of a) {
    if (!b.has(name)) continue
    assert.equal(b.get(name), integrity, `相同版本的依赖完整性不一致：${name}`)
    assert.deepEqual(left.patchedDependencies?.[name], right.patchedDependencies?.[name], `共有依赖的框架补丁不同：${name}`)
  }
  for (const field of ['dependencies', 'devDependencies', 'optionalDependencies']) {
    for (const [name, entry] of Object.entries(left.importers['.'][field] ?? {})) {
      const counterpart = right.importers['.'][field]?.[name]
      if (counterpart) assert.equal(entry.version.split('(')[0], counterpart.version.split('(')[0], `共有依赖版本不同：${name}`)
    }
  }
}

export async function install(consumer, store, logFile, offline = false) {
  return run('pnpm', ['install', '--frozen-lockfile', '--reporter', 'ndjson', '--store-dir', store, ...(offline ? ['--offline'] : [])], { cwd: consumer.project, logFile, timeout: 900_000 })
}

export async function cleanCache(consumer, output) {
  for (const name of [output, '.cache', '.temp', '.nuxt', '.vite', '.weapp-vite', path.join('node_modules', '.cache'), path.join('node_modules', '.vite')]) {
    const file = path.resolve(consumer.project, name)
    assert.ok(file !== consumer.project && inside(consumer.project, file), '拒绝删除消费项目以外的缓存')
    await rm(file, { force: true, recursive: true })
  }
}

export async function keepLockEvidence(consumer, dir) {
  await mkdir(dir, { recursive: true })
  await cp(path.join(consumer.project, 'package.json'), path.join(dir, `${consumer.mode}-package.json`))
  await cp(path.join(consumer.project, '.cost', 'framework-patches.json'), path.join(dir, `${consumer.mode}-framework-patches.json`))
  await cp(path.join(consumer.project, '.cost', 'framework-patches'), path.join(dir, `${consumer.mode}-framework-patches`), { recursive: true }).catch(error => { if (error.code !== 'ENOENT') throw error })
  // 已有快照的传递依赖可能不再可达，证据保留完整锁文件便于核查。
  const lock = parseLock(await readFile(path.join(consumer.project, 'pnpm-lock.yaml'), 'utf8'))
  await writeFile(path.join(dir, `${consumer.mode}-lock.yaml`), stringify(lock))
}
