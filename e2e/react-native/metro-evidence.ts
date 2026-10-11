import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { getManifestPathsForProjectRoot } from '../../packages/react-native/src/metro'

/** 在还原源码之前保存编译输入和发布状态；缺失本身作为诊断证据保留。 */
export async function captureMetroEvidence(projectRoot: string, output: string, inputs: Record<string, string>) {
  const { manifestPath, manifestReadyPath } = getManifestPathsForProjectRoot(projectRoot)
  await fs.mkdir(output, { recursive: true })
  const readyBefore = await fs.readFile(manifestReadyPath, 'utf8').catch(() => null)
  const files: Record<string, { source: string, sha256?: string, bytes?: number, error?: string }> = {}
  for (const [name, source] of Object.entries({ ...inputs, 'manifest.json': manifestPath, 'manifest.ready': manifestReadyPath })) {
    try {
      const content = await fs.readFile(source)
      await fs.writeFile(path.join(output, name), content)
      files[name] = { source, sha256: createHash('sha256').update(content).digest('hex'), bytes: content.byteLength }
    }
    catch (error) {
      files[name] = { source, error: error instanceof Error ? error.message : String(error) }
    }
  }
  const readyAfter = await fs.readFile(manifestReadyPath, 'utf8').catch(() => null)
  await fs.writeFile(path.join(output, 'snapshot.json'), `${JSON.stringify({
    capturedAt: new Date().toISOString(),
    readyBefore,
    readyAfter,
    stablePublication: readyBefore !== null && readyBefore === readyAfter,
    files,
  }, null, 2)}\n`)
}
