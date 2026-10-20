import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { MEDIA_GATE_SOURCE_SHA256 } from '../../examples/react-lynx/src/compatibility/media-gate-contract'
import sources from './fixtures/lynx-4.0.1/media-sources/sources.json'

/** 固定官方 4.0.1 源码，不在运行时拉取浮动的远端内容。 */
export async function validateMediaGateSources() {
  const hashes: Record<string, string> = {}
  for (const [source, proof] of Object.entries(sources).sort(([a], [b]) => a.localeCompare(b))) {
    const actual = createHash('sha256').update(await fs.readFile(path.join(import.meta.dirname, 'fixtures', 'lynx-4.0.1', 'media-sources', proof.file))).digest('hex')
    if (actual !== proof.sha256 || proof.url !== `https://raw.githubusercontent.com/lynx-family/lynx/4.0.1/${source}`) {
      throw new Error(`Lynx media gate SDK 源码身份变化：${source}`)
    }
    hashes[source] = actual
  }
  if (createHash('sha256').update(JSON.stringify(hashes)).digest('hex') !== MEDIA_GATE_SOURCE_SHA256) {
    throw new Error('Lynx media gate 源码合同发生变化，必须重新审查平台限制')
  }
}
