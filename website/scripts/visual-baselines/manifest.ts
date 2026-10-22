import type { captureIdentity, renderEnvironment } from './identity'
import type { VisualCase } from './report'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { digest, exactNames, pngRecord, regularBytes, regularDirectory, treeFiles } from './files'
import { baselineContract } from './identity'
import { expectedVisualCases, snapshotBindings } from './report'

export interface BaselineManifest {
  version: 1
  capturedAt: string
  source: Awaited<ReturnType<typeof captureIdentity>>
  environment: Awaited<ReturnType<typeof renderEnvironment>>
  reportSha256: string
  snapshotRoot: string
  skipped: string[]
  images: (VisualCase & Awaited<ReturnType<typeof pngRecord>>)[]
}

export interface BaselineReview {
  version: 1
  manifestSha256: string
  reviewer: string
  notes: string
  reviewedAt: string
  evidence: Awaited<ReturnType<typeof pngRecord>>[]
}

export async function visualCases(websiteRoot: string) {
  return expectedVisualCases(JSON.parse(await readFile(path.join(websiteRoot, 'routes.json'), 'utf8')))
}

export async function readBaselineManifest(directory: string, imagesDirectory: string, websiteRoot: string, environment: BaselineManifest['environment'], installed = false) {
  await regularDirectory(directory)
  if (!installed) {
    await regularDirectory(path.dirname(imagesDirectory))
  }
  const bytes = await regularBytes(path.join(directory, 'manifest.json'))
  const manifest = JSON.parse(bytes.toString()) as BaselineManifest
  if (manifest.version !== 1 || !Array.isArray(manifest.images) || !Array.isArray(manifest.skipped)
    || !/^[a-f\d]{40}$/.test(manifest.source?.head) || ![manifest.source?.lock, manifest.source?.build, manifest.source?.contract, manifest.reportSha256].every(hash => /^[a-f\d]{64}$/.test(hash))) {
    throw new Error('黄金候选清单版本或来源不完整')
  }
  if (JSON.stringify(manifest.environment) !== JSON.stringify(environment) || manifest.source.contract !== await baselineContract(websiteRoot)) {
    throw new Error('黄金基线的渲染环境或截图合同与本轮不一致')
  }
  const report = await regularBytes(path.join(directory, 'report.json'))
  if (digest(report) !== manifest.reportSha256) {
    throw new Error('黄金候选的真实运行报告发生变化')
  }
  const cases = await visualCases(websiteRoot)
  const bindings = snapshotBindings(JSON.parse(report.toString()), manifest.snapshotRoot, cases)
  const id = (item: VisualCase) => `${item.project}:${item.title}`
  exactNames(manifest.skipped, cases.filter(item => item.skipped).map(id))
  const expected = new Map(cases.filter(item => !item.skipped).map(item => [id(item), item]))
  exactNames(manifest.images.map(id), [...expected.keys()])
  const filenames = new Map(bindings.map(item => [id(item), item.file]))
  const files = await treeFiles(imagesDirectory)
  exactNames(installed ? files.filter(name => !name.startsWith('provenance/')) : files, manifest.images.map(item => item.file))
  for (const image of manifest.images) {
    const actual = await pngRecord(imagesDirectory, image.file)
    const planned = expected.get(id(image))!
    if (filenames.get(id(image)) !== image.file || JSON.stringify({ ...planned, ...actual }) !== JSON.stringify(image)) {
      throw new Error(`黄金 PNG 的身份、尺寸或字节发生变化：${image.file}`)
    }
  }
  return { manifest, sha256: digest(bytes) }
}

export async function readBaselineReview(directory: string, manifestSha256: string) {
  await regularDirectory(directory)
  const review = JSON.parse((await regularBytes(path.join(directory, 'review.json'))).toString()) as BaselineReview
  if (review.version !== 1 || review.manifestSha256 !== manifestSha256 || !review.reviewer?.trim() || !review.notes?.trim() || !review.evidence?.length) {
    throw new Error('基线缺少绑定当前候选的审查与视觉证据')
  }
  const evidenceDirectory = path.join(directory, 'review-evidence')
  exactNames(await treeFiles(evidenceDirectory), review.evidence.map(item => item.file))
  for (const evidence of review.evidence) {
    if (JSON.stringify(await pngRecord(evidenceDirectory, evidence.file)) !== JSON.stringify(evidence)) {
      throw new Error(`基线审查证据发生变化：${evidence.file}`)
    }
  }
  return review
}
