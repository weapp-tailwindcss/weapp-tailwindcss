import type { WatchLifecycle } from './watch-lifecycle'
import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import * as parcelWatcher from '@parcel/watcher'
import fg from 'fast-glob'
import { isBuildOutput } from './paths'
import { createWatchLifecycle } from './watch-lifecycle'

interface WatchOptions {
  cwd: string
  interval: number
  mode: 'native' | 'poll'
  outputs: readonly string[]
  rebuild: () => Promise<Set<string>>
}

class NativeWatcherError extends Error {}

function report(error: unknown) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
}

async function snapshot(options: WatchOptions, dependencies: ReadonlySet<string>) {
  const files = new Set([...dependencies, ...await fg('**/*', { cwd: options.cwd, absolute: true, dot: true, onlyFiles: true, ignore: ['node_modules/**', '.git/**'] })])
  const state = new Map<string, string>()
  await Promise.all([...files].map(async (file) => {
    if (isBuildOutput(file, options.outputs)) {
      return
    }
    try {
      const [stat, content] = await Promise.all([fs.stat(file), fs.readFile(file)])
      const digest = createHash('sha256').update(content).digest('hex')
      state.set(path.resolve(file), `${stat.mtimeMs}:${stat.size}:${digest}`)
    }
    catch {}
  }))
  return state
}

function changed(previous: Map<string, string>, next: Map<string, string>) {
  return previous.size !== next.size || [...next].some(([file, value]) => previous.get(file) !== value)
}

export async function watchBuildInputs(options: WatchOptions) {
  const lifecycle = createWatchLifecycle()
  try {
    if (options.mode === 'native') {
      try {
        await watchWithNativeWatcher(options, lifecycle)
        return
      }
      catch (error) {
        if (!(error instanceof NativeWatcherError)) {
          throw error
        }
        if (lifecycle.stopped) {
          return
        }
        report(`Native watcher unavailable, falling back to polling: ${error.message}`)
      }
    }
    await watchWithPolling(options, lifecycle)
  }
  finally {
    lifecycle.dispose()
  }
}

async function watchWithPolling(options: WatchOptions, lifecycle: WatchLifecycle) {
  let dependencies = new Set<string>()
  let previous = await snapshot(options, dependencies)
  if (lifecycle.stopped) {
    return
  }
  dependencies = await options.rebuild()
  const initialized = await snapshot(options, dependencies)
  // 只补充项目外依赖；项目内首次构建期间新增的文件也必须触发更新。
  for (const [file, value] of initialized) {
    if (!previous.has(file) && isOutsideDirectory(file, options.cwd)) {
      previous.set(file, value)
    }
  }
  while (!lifecycle.stopped) {
    await lifecycle.wait(options.interval)
    if (lifecycle.stopped) {
      break
    }
    try {
      const next = await snapshot(options, dependencies)
      if (!lifecycle.stopped && changed(previous, next)) {
        previous = next
        dependencies = await options.rebuild()
      }
    }
    catch (error) {
      report(error)
    }
  }
}

function isOutsideDirectory(file: string, cwd: string) {
  const relative = path.relative(cwd, file)
  return relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)
}

function parentDirectories(files: ReadonlySet<string>, cwd: string) {
  const directories = new Set([path.resolve(cwd)])
  for (const file of files) {
    if (isOutsideDirectory(file, cwd)) {
      directories.add(path.dirname(path.resolve(file)))
    }
  }
  return directories
}

async function watchWithNativeWatcher(options: WatchOptions, lifecycle: WatchLifecycle) {
  let dependencies = new Set<string>()
  const subscriptions = new Map<string, parcelWatcher.AsyncSubscription>()
  let pending = false
  const syncSubscriptions = async () => {
    const directories = parentDirectories(dependencies, options.cwd)
    for (const directory of directories) {
      if (lifecycle.stopped || subscriptions.has(directory)) {
        continue
      }
      try {
        const subscription = await parcelWatcher.subscribe(directory, (error, events) => {
          if (lifecycle.stopped) {
            return
          }
          if (error) {
            report(error)
            return
          }
          try {
            if (events.some(event => !isBuildOutput(event.path, options.outputs))) {
              pending = true
              lifecycle.wake()
            }
          }
          catch (error) {
            report(error)
          }
        }, { ignore: ['**/node_modules/**', '**/.git/**'] })
        subscriptions.set(directory, subscription)
      }
      catch (error) {
        throw new NativeWatcherError(error instanceof Error ? error.message : String(error))
      }
    }
    for (const [directory, subscription] of subscriptions) {
      if (!directories.has(directory)) {
        await subscription.unsubscribe()
        subscriptions.delete(directory)
      }
    }
  }

  try {
    // 先订阅再构建，构建期间的事件由 pending 保留。
    await syncSubscriptions()
    if (lifecycle.stopped) {
      return
    }
    dependencies = await options.rebuild()
    await syncSubscriptions()
    while (!lifecycle.stopped) {
      if (!pending) {
        await lifecycle.wait()
      }
      if (lifecycle.stopped) {
        break
      }
      pending = false
      try {
        dependencies = await options.rebuild()
      }
      catch (error) {
        report(error)
        continue
      }
      await syncSubscriptions()
    }
  }
  finally {
    await Promise.all([...subscriptions.values()].map(subscription => subscription.unsubscribe()))
  }
}
