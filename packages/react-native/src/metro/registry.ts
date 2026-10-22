import type { NativeStyleManifest } from '../types'
import type { NativeManifestSnapshot } from './publication'
import path from 'node:path'
import { virtualModuleCode } from './virtual-module'

export interface RegisteredManifest {
  readonly version: number
  readonly manifest: NativeManifestSnapshot['manifest']
  snapshot: NativeManifestSnapshot
  projectRoot: string
  virtualPath: string
  manifestPath: string
  manifestReadyPath: string
  ready: Promise<void>
  refresh: () => Promise<void>
}

export const registry = new Map<string, RegisteredManifest>()
const publicEntries = new WeakMap<RegisteredManifest, Readonly<RegisteredManifest>>()

export function getRegisteredVirtualModule(filename: string): Readonly<RegisteredManifest> | undefined {
  const entry = [...registry.values()].find(entry => entry.virtualPath === filename)
  if (!entry) {
    return undefined
  }
  let view = publicEntries.get(entry)
  if (!view) {
    const properties = Object.fromEntries((Object.keys(entry) as (keyof RegisteredManifest)[])
      .map(key => [key, { enumerable: true, get: () => entry[key] }]))
    view = Object.freeze(Object.defineProperties({}, properties)) as Readonly<RegisteredManifest>
    publicEntries.set(entry, view)
  }
  return view
}

/** 检查 ready 与返回 snapshot 在同一微任务内完成，不能夹入新的刷新。 */
export async function readRegisteredSnapshot(entry: Readonly<RegisteredManifest> | undefined): Promise<NativeManifestSnapshot | undefined> {
  if (!entry) {
    return undefined
  }
  for (;;) {
    const ready = entry.ready
    try {
      await ready
    }
    catch (error) {
      if (ready === entry.ready) {
        throw error
      }
    }
    if (ready === entry.ready) {
      return entry.snapshot
    }
  }
}

export function getRegisteredSnapshot(id: string): Promise<NativeManifestSnapshot | undefined> {
  return readRegisteredSnapshot(registry.get(id))
}

/** 文件路径与项目根目录查询均选择最近注册的入口，不能混用两个实例的身份。 */
export function getRegisteredSnapshotByPath(filename: string): Promise<NativeManifestSnapshot | undefined> {
  return readRegisteredSnapshot([...registry.values()].filter(entry => entry.manifestPath === filename).at(-1))
}

export function getRegisteredSnapshotByProjectRoot(projectRoot: string): Promise<NativeManifestSnapshot | undefined> {
  const resolvedRoot = path.resolve(projectRoot)
  return readRegisteredSnapshot([...registry.values()].filter(entry => entry.projectRoot === resolvedRoot).at(-1))
}

export async function getRegisteredManifest(id: string): Promise<NativeStyleManifest | undefined> {
  return (await getRegisteredSnapshot(id))?.manifest
}

export async function getRegisteredManifestByPath(filename: string): Promise<NativeStyleManifest | undefined> {
  return (await getRegisteredSnapshotByPath(filename))?.manifest
}

export async function getRegisteredManifestByProjectRoot(projectRoot: string): Promise<NativeStyleManifest | undefined> {
  return (await getRegisteredSnapshotByProjectRoot(projectRoot))?.manifest
}

/** 同步读取最近快照供诊断；只有异步入口会等待当前发布成功。 */
export function getVirtualModuleCode(filename: string) {
  const snapshot = getRegisteredVirtualModule(filename)?.snapshot
  return snapshot ? virtualModuleCode(snapshot.manifest, snapshot.publication, snapshot.manifestJson) : undefined
}

export async function getVirtualModuleCodeAsync(filename: string) {
  const snapshot = await readRegisteredSnapshot(getRegisteredVirtualModule(filename))
  return snapshot ? virtualModuleCode(snapshot.manifest, snapshot.publication, snapshot.manifestJson) : undefined
}
