import type { EventEmitter } from 'node:events'
import path from 'node:path'

interface DirectoryWatcher extends EventEmitter {
  path: string
  files: Map<string, unknown>
  initialScan: boolean
  closed: boolean
  refs: number
  watcher?: EventEmitter
}

interface Watchpack {
  paused: boolean
  watcherManager: object
  fileWatchers: Map<string, { watcher: { directoryWatcher: DirectoryWatcher } }>
  directoryWatchers: Map<string, { watcher: { directoryWatcher: DirectoryWatcher } }>
}

/** 只观测本夹具的真实监听实例，不改变事件、扫描或监听就绪语义。 */
export function createWebpackWatchTrace(
  fileSystem: unknown,
  root: string,
  record: (event: string, detail?: object) => unknown,
) {
  const identities = new WeakMap<object, number>()
  const observed = new WeakSet<object>()
  let sequence = 0
  const id = (value: object) => {
    if (!identities.has(value)) {
      identities.set(value, ++sequence)
    }
    return identities.get(value)
  }
  const belongs = (file: string) => {
    const relative = path.relative(root, file)
    return !path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`)
  }
  const directoryState = (directory: DirectoryWatcher) => ({
    id: id(directory),
    path: directory.path,
    initialScan: directory.initialScan,
    closed: directory.closed,
    refs: directory.refs,
    files: [...directory.files.keys()].slice(0, 50),
    totalFiles: directory.files.size,
  })
  return () => {
    let owner = fileSystem as { wfs?: unknown, watcher?: Watchpack }
    while (owner.wfs) {
      owner = owner.wfs as typeof owner
    }
    const pack = owner.watcher
    if (!pack) {
      return undefined
    }
    const watched = [...pack.fileWatchers, ...pack.directoryWatchers].filter(([file]) => belongs(file))
    const directories = new Set(watched.map(([, value]) => value.watcher.directoryWatcher))
    for (const directory of directories) {
      const source = directory.watcher
      if (source && !observed.has(source)) {
        observed.add(source)
        const sourceId = id(source)
        source.on('change', (event, file) => record('native-event', { sourceId, event, file, directory: directoryState(directory) }))
        source.on('rescan', () => record('native-rescan', { sourceId, directory: directoryState(directory) }))
      }
      if (!observed.has(directory)) {
        observed.add(directory)
        directory.on('closed', () => record('directory-closed', { directory: directoryState(directory) }))
      }
    }
    return {
      packId: id(pack),
      managerId: id(pack.watcherManager),
      paused: pack.paused,
      targets: watched.slice(0, 50).map(([file, value]) => ({ file, directoryId: id(value.watcher.directoryWatcher) })),
      totalTargets: watched.length,
      directories: [...directories].slice(0, 50).map(directoryState),
      totalDirectories: directories.size,
    }
  }
}
