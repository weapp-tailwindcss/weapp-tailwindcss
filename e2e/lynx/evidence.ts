import type { NativeArtifactReceipt, NativeEvidenceContext, NativePlatformReport } from '../../examples/react-lynx/src/compatibility/types'
import { createHash, randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { compatibilityCases } from '../../examples/react-lynx/src/compatibility/catalog'
import { evidenceSequence } from '../../examples/react-lynx/src/compatibility/evidence'
import staticEvidence from '../../examples/react-lynx/src/compatibility/static-evidence.json'

export function sha256(data: Uint8Array) {
  return createHash('sha256').update(data).digest('hex')
}

export function createEvidenceContext(bundle: Uint8Array): NativeEvidenceContext {
  return { version: 1, runId: randomUUID(), bundleSha256: sha256(bundle) }
}

export function validateEvidenceContext(value: NativeEvidenceContext | undefined): asserts value is NativeEvidenceContext {
  if (value?.version !== 1 || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value.runId) || !/^[a-f0-9]{64}$/.test(value.bundleSha256)) {
    throw new Error('缺少有效的本轮 Lynx evidence 身份')
  }
}

/** 先验证本轮身份与完整清单，再接触清单中的文件名。 */
export function validateEvidenceManifest(report: NativePlatformReport, expected: NativeEvidenceContext) {
  validateEvidenceContext(expected)
  const evidence = report.evidence
  validateEvidenceContext(evidence)
  if (evidence.runId !== expected.runId || evidence.bundleSha256 !== expected.bundleSha256) {
    throw new Error('Lynx 报告不属于本轮运行或实际 bundle')
  }
  const builtById = new Map(staticEvidence.results.map(item => [item.id, item]))
  const names = compatibilityCases.flatMap(item => evidenceSequence(item, builtById.get(item.id))?.frames.map(frame => `${item.id}-${frame}.png`) ?? [])
  if (!Array.isArray(evidence.artifacts) || evidence.artifacts.length !== names.length) {
    throw new Error('Lynx evidence 截图清单缺帧或包含额外帧')
  }
  const remaining = new Set(names)
  for (const receipt of evidence.artifacts) {
    if (!receipt || !remaining.delete(receipt.name) || receipt.runId !== expected.runId || !/^[a-f0-9]{64}$/.test(receipt.sha256) || !Number.isSafeInteger(receipt.byteLength) || receipt.byteLength <= 0) {
      throw new Error(`Lynx evidence 截图回执无效或重复：${receipt?.name}`)
    }
  }
  return evidence.artifacts
}

function validateBytes(receipt: NativeArtifactReceipt, data: Uint8Array) {
  if (data.byteLength !== receipt.byteLength || sha256(data) !== receipt.sha256) {
    throw new Error(`Lynx evidence 截图字节与本轮回执不符：${receipt.name}`)
  }
}

export function cropsDirectory(artifactDir: string, expected: NativeEvidenceContext) {
  validateEvidenceContext(expected)
  return path.join(artifactDir, 'crops', expected.runId)
}

/** 独占新目录；读取或复制任何一帧失败均拒绝，绝不回退到旧 crops。 */
export async function collectNativeEvidence(report: NativePlatformReport, artifactDir: string, expected: NativeEvidenceContext, read: (name: string) => Promise<Uint8Array>) {
  const receipts = validateEvidenceManifest(report, expected)
  const directory = cropsDirectory(artifactDir, expected)
  await fs.mkdir(path.dirname(directory), { recursive: true })
  await fs.mkdir(directory)
  for (const receipt of receipts) {
    const data = await read(receipt.name)
    validateBytes(receipt, data)
    await fs.writeFile(path.join(directory, receipt.name), data, { flag: 'wx' })
  }
}

export async function validateNativeEvidence(report: NativePlatformReport, artifactDir: string, expected: NativeEvidenceContext) {
  const receipts = validateEvidenceManifest(report, expected)
  const directory = cropsDirectory(artifactDir, expected)
  for (const receipt of receipts) {
    validateBytes(receipt, await fs.readFile(path.join(directory, receipt.name)))
  }
  return directory
}

/** 更新器从 runner 独立落盘的身份和 bundle 取期望值，不信任报告自报身份。 */
export async function readEvidenceContext(artifactDir: string) {
  try {
    const context = JSON.parse(await fs.readFile(path.join(artifactDir, 'run-context.json'), 'utf8')) as NativeEvidenceContext
    validateEvidenceContext(context)
    if (sha256(await fs.readFile(path.join(artifactDir, 'main.lynx.bundle'))) !== context.bundleSha256) {
      throw new Error('bundle SHA-256 不匹配')
    }
    return context
  }
  catch (cause) {
    throw new Error('无法验证本轮 Lynx evidence 身份和 bundle', { cause })
  }
}
