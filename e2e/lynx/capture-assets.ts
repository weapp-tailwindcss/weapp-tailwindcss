import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

export interface CaptureAsset {
  name: string
  sha256: string
}

/** 只扫描显式产物目录中的本地位图，并保持 bundler 资产名和原始字节。 */
export async function stageCaptureAssets(assetRoot: string, hostRoot: string, artifactRoot: string) {
  const sourceRoot = await fs.realpath(assetRoot)
  const assets: CaptureAsset[] = []
  const sources: Array<{ source: string, segments: string[] }> = []
  async function visit(directory: string, segments: string[]) {
    for (const entry of (await fs.readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const source = path.join(directory, entry.name)
      const child = [...segments, entry.name]
      if (entry.isSymbolicLink()) {
        throw new Error(`录制资产目录禁止符号链接：${source}`)
      }
      if (entry.isDirectory()) {
        await visit(source, child)
      }
      else if (entry.isFile() && /\.(?:png|jpe?g|webp)$/i.test(entry.name)) {
        const bytes = await fs.readFile(source)
        assets.push({ name: child.join('/'), sha256: crypto.createHash('sha256').update(bytes).digest('hex') })
        sources.push({ source, segments: child })
      }
    }
  }
  await visit(sourceRoot, [])
  if (assets.length === 0) {
    throw new Error(`录制资产目录缺少本地位图：${sourceRoot}`)
  }
  for (const root of [hostRoot, artifactRoot]) {
    const destination = path.join(root, 'capture-assets')
    if ((await fs.lstat(destination).catch(() => undefined))?.isSymbolicLink()) {
      throw new Error(`录制资产目标禁止符号链接：${destination}`)
    }
    await fs.rm(destination, { force: true, recursive: true })
    await fs.mkdir(destination, { recursive: true })
    for (const file of sources) {
      const output = path.join(destination, ...file.segments)
      await fs.mkdir(path.dirname(output), { recursive: true })
      await fs.copyFile(file.source, output)
    }
  }
  await fs.writeFile(path.join(artifactRoot, 'capture-assets.json'), `${JSON.stringify({ version: 1, files: assets }, null, 2)}\n`, { flag: 'wx' })
  return assets
}
