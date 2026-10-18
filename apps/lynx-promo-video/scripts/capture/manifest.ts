import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

export type CapturePlatform = 'android' | 'ios'

export interface FileDigest {
  path: string
  sha256: string
}

export interface SourceSnapshot {
  root: string
  sha256: string
  files: FileDigest[]
}

export interface NativeCapture {
  device: Record<string, unknown> | string
  runtime: string
  sourceSha256: string
  rawVideo: string
  video: string
  cover: string
  bundle: FileDigest
}

export interface DevelopmentEvent {
  id: string
  startSeconds: number
  endSeconds: number
  sourceSha256: string
  bundleSha256: string
  source?: SourceSnapshot
  bundle?: FileDigest
  rawStartSeconds?: number
  rawEndSeconds?: number
}

export interface DevelopmentClip {
  sceneId: string
  eventId: string
  startSeconds: number
  endSeconds: number
  playbackRate?: number
}

export interface CaptureManifest {
  version: 1
  createdAt: string
  source: SourceSnapshot
  platforms: Partial<Record<CapturePlatform, NativeCapture>>
  development?: {
    video: string
    rawVideo: string
    events: DevelopmentEvent[]
    clips: DevelopmentClip[]
  }
  compatibility?: {
    screenshot: string
    source: string
  }
}

export function sha256(data: string | Uint8Array) {
  return createHash('sha256').update(data).digest('hex')
}

export async function digestFile(file: string): Promise<FileDigest> {
  return { path: file, sha256: sha256(await fs.readFile(file)) }
}

/** 清单中的文件路径以清单所在目录为基准，避免绑定录制机器的 checkout。 */
export function resolveManifestPath(manifestFile: string, file: string, paths: Pick<typeof path, 'resolve' | 'dirname'> = path) {
  return paths.resolve(paths.dirname(manifestFile), file)
}

export function manifestRelativePath(manifestFile: string, file: string) {
  return path.relative(path.dirname(manifestFile), file)
}

export async function snapshotSources(root: string): Promise<SourceSnapshot> {
  const files: FileDigest[] = []
  async function visit(directory: string) {
    const entries = await fs.readdir(directory, { withFileTypes: true })
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
      const file = path.join(directory, entry.name)
      if (entry.isDirectory()) {
        await visit(file)
      }
      else if (entry.isFile()) {
        files.push({ path: path.relative(root, file), sha256: sha256(await fs.readFile(file)) })
      }
    }
  }
  await visit(path.join(root, 'src'))
  for (const name of ['lynx.config.ts', 'rspeedy.config.ts', 'package.json']) {
    const file = path.join(root, name)
    if (await fs.stat(file).catch(() => undefined)) {
      files.push({ path: name, sha256: sha256(await fs.readFile(file)) })
    }
  }
  return { root, files, sha256: sha256(JSON.stringify(files)) }
}

export async function readCaptureManifest(file: string): Promise<CaptureManifest> {
  const source = JSON.parse(await fs.readFile(file, 'utf8')) as CaptureManifest
  if (source.version !== 1 || !source.source || !source.platforms || !Array.isArray(source.source.files)) {
    throw new Error(`${file} 缺少有效的录制清单（version: 1）。`)
  }
  return source
}

export async function writeCaptureManifest(file: string, manifest: CaptureManifest) {
  await fs.mkdir(path.dirname(file), { recursive: true })
  await fs.writeFile(file, `${JSON.stringify(manifest, null, 2)}\n`)
}
