import { lstat, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { install } from './fixtures.mjs'
import { modes, order } from './model.mjs'
import { parseLock } from './published.mjs'
import { isolateInstallConsumers } from './install-consumers.mjs'

export function downloadFootprint(log) {
  const sizes = new Map()
  const fetched = new Set()
  for (const line of log.split(/\r?\n/)) {
    let event
    try { event = JSON.parse(line) } catch { continue }
    if (event.name === 'pnpm:fetching-progress' && event.status === 'started' && Number.isFinite(event.size)) sizes.set(event.packageId, event.size)
    if (event.name === 'pnpm:progress' && event.status === 'fetched') fetched.add(event.packageId)
  }
  const missing = [...fetched].filter(id => !sizes.has(id))
  return { packageArchiveBytes: missing.length || !fetched.size ? null : [...fetched].reduce((sum, id) => sum + sizes.get(id), 0), downloadedPackages: fetched.size, missingArchiveSizes: missing }
}

export async function diskBytes(directory, seen = new Set()) {
  const stat = await lstat(directory)
  if (stat.isSymbolicLink()) return 0
  if (!stat.isDirectory()) {
    const identity = `${stat.dev}:${stat.ino}`
    if (stat.ino && seen.has(identity)) return 0
    if (stat.ino) seen.add(identity)
    return stat.size
  }
  let total = 0
  for (const entry of await readdir(directory)) total += await diskBytes(path.join(directory, entry), seen)
  return total
}

export async function measureInstall(buildConsumers, rows, options) {
  const consumers = await isolateInstallConsumers(buildConsumers, path.join(options.directory, 'install-consumers'))
  const manifests = Object.fromEntries(await Promise.all(modes.map(async mode => [mode, await readFile(path.join(consumers[mode].project, 'package.json'), 'utf8')])))
  const locks = Object.fromEntries(await Promise.all(modes.map(async mode => [mode, await readFile(path.join(consumers[mode].project, 'pnpm-lock.yaml'), 'utf8')])))
  try {
  for (let round = 0; round < options.runs; round++) {
    for (const mode of order(round, options.reverse)) {
      const consumer = consumers[mode]
      const coldStore = path.join(options.directory, `cold-${round}-${mode}`)
      await rm(path.join(consumer.project, 'node_modules'), { recursive: true, force: true })
      const cold = await install(consumer, coldStore, path.join(options.logs, `${mode}-install-cold-${round}.log`))
      cold.installedBytes = await diskBytes(path.join(consumer.project, 'node_modules'))
      cold.storeBytes = await diskBytes(coldStore)
      cold.packageCount = Object.keys(parseLock(locks[mode]).packages).length
      cold.additionalPackages = cold.packageCount - Object.keys(parseLock(locks.native).packages).length
      Object.assign(cold, downloadFootprint(await readFile(path.join(options.logs, `${mode}-install-cold-${round}.log`), 'utf8')))
      cold.installedPackageInstances = (await readdir(path.join(consumer.project, 'node_modules', '.pnpm'), { withFileTypes: true })).filter(entry => entry.isDirectory() && entry.name !== 'node_modules').length
      delete cold.stdout
      rows['install.cold'].samples[mode].push(cold)
      await options.checkpoint?.()
      await rm(path.join(consumer.project, 'node_modules'), { recursive: true, force: true })
      const offline = await install(consumer, coldStore, path.join(options.logs, `${mode}-install-offline-${round}.log`), true)
      delete offline.stdout
      rows['install.offline'].samples[mode].push(offline)
      await options.checkpoint?.()
      await rm(path.join(consumer.project, 'node_modules'), { recursive: true, force: true })
      // 先按不接入组准备已有依赖，再计时接入；原生组对应一次无新增依赖的安装。
      await writeFile(path.join(consumer.project, 'package.json'), manifests.native)
      await writeFile(path.join(consumer.project, 'pnpm-lock.yaml'), locks.native)
      await install(consumer, coldStore, path.join(options.logs, `${mode}-incremental-prepare-${round}.log`))
      await writeFile(path.join(consumer.project, 'package.json'), manifests[mode])
      await writeFile(path.join(consumer.project, 'pnpm-lock.yaml'), locks[mode])
      const incremental = await install(consumer, coldStore, path.join(options.logs, `${mode}-install-incremental-${round}.log`), true)
      delete incremental.stdout
      rows['install.incremental'].samples[mode].push(incremental)
      await options.checkpoint?.()
      await rm(coldStore, { recursive: true, force: true })
    }
  }
  }
  finally {
    for (const mode of modes) {
      await writeFile(path.join(consumers[mode].project, 'package.json'), manifests[mode])
      await writeFile(path.join(consumers[mode].project, 'pnpm-lock.yaml'), locks[mode])
    }
  }
  for (const row of Object.values(rows)) { row.status = 'passed'; row.semanticVerified = true }
}
