import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { getManifestPathsForProjectRoot } from '../../packages/react-native/src/metro'

/** 在还原源码之前保存编译输入和发布状态；缺失本身作为诊断证据保留。 */
export async function captureMetroEvidence(projectRoot: string, output: string, inputs: Record<string, string>, signal?: AbortSignal) {
  signal?.throwIfAborted()
  const { manifestPath, manifestReadyPath } = getManifestPathsForProjectRoot(projectRoot)
  await fs.mkdir(output, { recursive: true })
  const readReady = async () => {
    signal?.throwIfAborted()
    try {
      const ready = await fs.readFile(manifestReadyPath, { encoding: 'utf8', signal })
      signal?.throwIfAborted()
      return ready
    }
    catch {
      signal?.throwIfAborted()
      return null
    }
  }
  const readyBefore = await readReady()
  const files: Record<string, { source: string, sha256?: string, bytes?: number, error?: string }> = {}
  for (const [name, source] of Object.entries({ ...inputs, 'manifest.json': manifestPath, 'manifest.ready': manifestReadyPath })) {
    signal?.throwIfAborted()
    try {
      const content = await fs.readFile(source, { signal })
      signal?.throwIfAborted()
      await fs.writeFile(path.join(output, name), content, { signal })
      signal?.throwIfAborted()
      files[name] = { source, sha256: createHash('sha256').update(content).digest('hex'), bytes: content.byteLength }
    }
    catch (error) {
      signal?.throwIfAborted()
      files[name] = { source, error: error instanceof Error ? error.message : String(error) }
    }
  }
  const readyAfter = await readReady()
  await fs.writeFile(path.join(output, 'snapshot.json'), `${JSON.stringify({
    capturedAt: new Date().toISOString(),
    readyBefore,
    readyAfter,
    stablePublication: readyBefore !== null && readyBefore === readyAfter,
    files,
  }, null, 2)}\n`, { signal })
  signal?.throwIfAborted()
}
