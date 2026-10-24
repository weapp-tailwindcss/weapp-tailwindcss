import { stat, utimes } from 'node:fs/promises'
import path from 'node:path'
import { setTimeout } from 'node:timers/promises'
import { getWatchPathEntry } from './rollup-watch-paths.mjs'

export function isOwnershipSourceRegistered(task, file, owner) {
  const watcher = task.fileWatcher.fileGroups.get(path.resolve(owner))?.watcher
  return Boolean(watcher && getWatchPathEntry(watcher._closers, owner)
    && getWatchPathEntry(watcher._closers, file) && watcher._streams.size === 0)
}

export async function prepareOwnershipSource({
  task,
  file,
  owner,
  sources,
  timeoutMs = 5000,
  now = () => performance.now(),
  pause = () => setTimeout(1),
  readStat = () => stat(file),
  publish = (atime, mtime) => utimes(file, atime, new Date(mtime)),
  isDrained = () => true,
}) {
  const deadline = now() + timeoutMs
  const wait = async (stage) => {
    if (now() >= deadline) {
      throw new Error(`原生订阅握手超时：${stage}`)
    }
    await pause()
  }
  while (!isOwnershipSourceRegistered(task, file, owner)) {
    await wait('owner-registration')
  }
  const watcher = task.fileWatcher.fileGroups.get(path.resolve(owner)).watcher
  const before = await readStat()
  const offset = sources.length
  const key = path.resolve(file)
  let probe = Math.floor(before.mtimeMs / 1000) * 1000
  const acknowledged = () => sources.slice(offset).some(source => source.watcher === watcher
    && source.file === key && source.event === 'update' && source.stats?.mtimeMs === probe)
  // 原生句柄登记不等于事件流已生效；同一 deadline 内取得目标自己的新 mtime 回执。
  do {
    if (now() >= deadline) {
      throw new Error('原生订阅握手超时：source-acknowledgement')
    }
    await publish(before.atime, probe += 1000)
    await wait('source-acknowledgement')
  } while (!acknowledged())
  // 已接收的 stat/目录扫描和 watch 节流任务必须排空，才可清掉 probe 通知。
  while (!isDrained() || watcher._streams.size > 0 || getWatchPathEntry(watcher._throttled.get('watch') ?? [], file)
    || getWatchPathEntry(watcher._throttled.get('readdir') ?? [], owner)) {
    await wait('source-drain')
  }
}
