import type { BigIntStats } from 'node:fs'
import fs from 'node:fs'
import path from 'node:path'

function fileVersion(stat: BigIntStats) {
  return [stat.dev, stat.ino, stat.size, stat.mtimeNs, stat.ctimeNs].join(':')
}

function readFileVersion(target: string) {
  try {
    return fileVersion(fs.statSync(target, { bigint: true }))
  }
  catch (error) {
    if (['ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code ?? '')) {
      return undefined
    }
    throw error
  }
}

/** 父目录事件提供即时通知，文件版本核对补齐原生通知遗漏。 */
export function watchInput(target: string, changed: () => void) {
  // 必须在返回前建立基线，异步首次采样可能已经越过第一次保存。
  const initial = fs.statSync(target, { bigint: true })
  const recursive = initial.isDirectory()
  const watchRoot = recursive ? target : path.dirname(target)
  let version: string | undefined = fileVersion(initial)
  let closed = false
  let timer: ReturnType<typeof setInterval> | undefined
  const watcher = fs.watch(watchRoot, { persistent: false, recursive }, (_event, filename) => {
    if (closed) {
      return
    }
    if (recursive) {
      changed()
    }
    else if (filename === null || path.resolve(watchRoot, filename) === target) {
      reconcile(true)
    }
  })

  function reconcile(force: boolean) {
    if (closed) {
      return
    }
    let current: string | undefined
    try {
      current = readFileVersion(target)
    }
    catch (error) {
      watcher.close()
      watcher.emit('error', error)
      return
    }
    if (force || current !== version) {
      version = current
      changed()
    }
  }

  const stop = () => {
    closed = true
    clearInterval(timer)
  }
  const close = watcher.close.bind(watcher)
  watcher.close = () => {
    if (closed) {
      return
    }
    stop()
    close()
  }
  watcher.once('close', stop)
  // 目录 stat 不反映后代文件的内容变化，目录仍使用原生递归监听。
  if (!recursive) {
    timer = setInterval(reconcile, 100, false)
    timer.unref()
  }
  return watcher
}
