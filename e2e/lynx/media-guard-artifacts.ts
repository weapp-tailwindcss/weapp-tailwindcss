import type { StaticEvidenceReport } from '../../examples/react-lynx/src/compatibility/types'
import fs from 'node:fs/promises'
import path from 'node:path'
import { MEDIA_GATE_CANDIDATES } from '../../examples/react-lynx/src/compatibility/media-gate-contract'
import { decodeLynxBundle } from './decoder'
import { reviewedCandidateEncodingRejections } from './expectations'
import { validateMediaGateSources } from './media-gate-source'
import { parseDecodedRules, parseGeneratedRules, selectorHasCandidate, staticMediaGuard } from './static-evidence'

/** 从本轮 bundle 重新解码所有分支，报告 metadata 或 serializer 输入不能代替编码输出。 */
export async function validateMediaGuardArtifacts(directory: string, built: StaticEvidenceReport) {
  await validateMediaGateSources()
  const [css, bundle] = await Promise.all([
    fs.readFile(path.join(directory, 'main.css'), 'utf8'),
    fs.readFile(path.join(directory, 'main.lynx.bundle')),
  ])
  const generated = parseGeneratedRules(css)
  const bundled = parseDecodedRules((await decodeLynxBundle(bundle)).css.text)
  for (const className of reviewedCandidateEncodingRejections) {
    const expected = built.results.flatMap(item => item.candidates ?? []).find(candidate => candidate.className === className)
    if (!expected?.generated || expected.bundled || expected.failureStage !== 'encoder' || expected.mediaGuard
      || !generated.some(rule => selectorHasCandidate(rule.selector, className) && rule.declarations.length)
      || bundled.some(rule => selectorHasCandidate(rule.selector, className) && rule.declarations.length)) {
      throw new Error(`${className} 本轮 bundle 的逐候选 encoder 拒绝证据缺失或与静态合同不符`)
    }
  }
  for (const className of MEDIA_GATE_CANDIDATES) {
    if ((reviewedCandidateEncodingRejections as readonly string[]).includes(className)) {
      continue
    }
    const proof = staticMediaGuard(className, generated, bundled)
    const expected = built.results.flatMap(item => item.candidates ?? []).find(candidate => candidate.className === className)?.mediaGuard
    if (!proof || !expected || JSON.stringify(proof) !== JSON.stringify(expected)) {
      throw new Error(`${className} 本轮 CSS/bundle 的必要 media guard 缺失或与静态合同不符`)
    }
  }
}
