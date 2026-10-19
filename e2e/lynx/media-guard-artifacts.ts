import type { StaticEvidenceReport } from '../../examples/react-lynx/src/compatibility/types'
import fs from 'node:fs/promises'
import path from 'node:path'
import { MEDIA_GATE_CANDIDATES } from '../../examples/react-lynx/src/compatibility/media-gate-contract'
import { validateMediaGateSources } from './media-gate-source'
import { flattenEncodedRules, parseGeneratedRules, staticMediaGuard } from './static-evidence'

/** 从本轮产物重新计算所有分支，报告自报 guard 或旧静态 metadata 都不能代替实际 CSS/TASM。 */
export async function validateMediaGuardArtifacts(directory: string, built: StaticEvidenceReport) {
  await validateMediaGateSources()
  const [css, tasm] = await Promise.all([
    fs.readFile(path.join(directory, 'main.css'), 'utf8'),
    fs.readFile(path.join(directory, 'tasm.json'), 'utf8').then(source => JSON.parse(source)),
  ])
  const generated = parseGeneratedRules(css)
  const bundled = flattenEncodedRules(Object.values(tasm.css.cssMap).flat() as Parameters<typeof flattenEncodedRules>[0])
  for (const className of MEDIA_GATE_CANDIDATES) {
    const proof = staticMediaGuard(className, generated, bundled)
    const expected = built.results.flatMap(item => item.candidates ?? []).find(candidate => candidate.className === className)?.mediaGuard
    if (!proof || !expected || JSON.stringify(proof) !== JSON.stringify(expected)) {
      throw new Error(`${className} 本轮 CSS/TASM 的必要 media guard 缺失或与静态合同不符`)
    }
  }
}
