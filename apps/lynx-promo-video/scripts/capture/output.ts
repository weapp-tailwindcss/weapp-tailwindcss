import type { CapturePlatform } from './manifest'
import fs from 'node:fs/promises'
import path from 'node:path'

/** 只创建独占父目录，raw 子目录由原生 runner 独占创建。 */
export async function allocateCaptureOutput(captureRoot: string, platform: CapturePlatform) {
  await fs.mkdir(captureRoot, { recursive: true })
  const runDir = await fs.mkdtemp(path.join(captureRoot, `${platform}-`))
  return { runDir, rawDir: path.join(runDir, 'raw') }
}

export async function preservePublishedCapture(files: string[], archiveRoot: string) {
  const existing: string[] = []
  for (const file of files) {
    if (await fs.stat(file).catch(() => undefined)) {
      existing.push(file)
    }
  }
  if (existing.length === 0) {
    return undefined
  }
  await fs.mkdir(archiveRoot, { recursive: true })
  const archive = await fs.mkdtemp(path.join(archiveRoot, 'previous-'))
  for (const file of existing) {
    await fs.copyFile(file, path.join(archive, path.basename(file)))
  }
  return archive
}
