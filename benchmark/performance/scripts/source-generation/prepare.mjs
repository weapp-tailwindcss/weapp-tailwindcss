import assert from 'node:assert/strict'
import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { serialize } from 'node:v8'
import { parse, stringify } from 'yaml'
import { createConsumer, compareCommonLocks, keepLockEvidence, seedPreparationStore } from '../../demo/fixtures.mjs'
import { prepareInstalledTarget } from '../../demo/prepare.mjs'
import { prepareFrameworkPatches } from '../../demo/framework-patches.mjs'
import { hash, inside, parseLock } from '../../demo/published.mjs'
import { run } from '../../demo/process.mjs'

// 仅供源码 tarball 实验使用，不进入发布版周报的安装或完整性校验链路。
const request = JSON.parse(await readFile(process.argv[2], 'utf8'))
const { item, directory, logs, artifacts, response, registry } = request
await mkdir(logs, { recursive: true })
const consumers = {}
const locks = {}
const identities = {}
for (const [name, file] of Object.entries(artifacts.packages)) identities[name] = { file, sha256: hash(await readFile(file)) }
for (const mode of ['enabled', 'native', 'static']) {
  const consumer = await createConsumer(item, { version: artifacts.version }, directory, mode)
  consumers[mode] = consumer
  const workspaceFile = path.join(consumer.project, 'pnpm-workspace.yaml')
  const workspace = parse(await readFile(workspaceFile, 'utf8'))
  workspace.overrides = Object.fromEntries(Object.entries(artifacts.packages).map(([name, file]) => [name, `file:${path.relative(consumer.project, file).replaceAll(path.sep, '/')}`]))
  await writeFile(workspaceFile, stringify(workspace))
  const store = path.join(directory, `${mode}-store`)
  if (mode !== 'enabled') await seedPreparationStore(path.join(directory, 'enabled-store'), store)
  const install = () => run('pnpm', ['install', '--no-frozen-lockfile', '--store-dir', store, ...(registry ? ['--registry', registry] : [])], { cwd: consumer.project, logFile: path.join(logs, `${mode}-install.log`) })
  await install()
  let lock = parseLock(await readFile(path.join(consumer.project, 'pnpm-lock.yaml'), 'utf8'))
  if (Object.keys(await prepareFrameworkPatches(consumer.project, lock)).length) await install()
  lock = parseLock(await readFile(path.join(consumer.project, 'pnpm-lock.yaml'), 'utf8'))
  assert.ok(!JSON.stringify(lock).includes('link:'), '源码实验不能使用 workspace 链接')
  locks[mode] = lock
  await keepLockEvidence(consumer, path.join(logs, 'dependencies'))
}
compareCommonLocks(locks.native, locks.static)
compareCommonLocks(locks.native, locks.enabled)
const require = createRequire(path.join(consumers.enabled.project, 'package.json'))
const main = await realpath(require.resolve('weapp-tailwindcss/package.json'))
assert.ok(inside(consumers.enabled.project, main), '源码包解析必须位于独立消费项目内')
const nested = createRequire(main)
const engine = await realpath(nested.resolve('@weapp-tailwindcss/engine'))
assert.ok(inside(consumers.enabled.project, engine), '引擎不能回退到仓库实现')
const evidence = { kind: 'source-tarballs', artifacts: identities, source: artifacts.source, resolution: { main, engine } }
const prepared = await prepareInstalledTarget(item, consumers, locks, logs, evidence)
await writeFile(response, serialize(prepared))
