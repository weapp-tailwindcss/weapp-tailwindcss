import { cp, lstat, mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { digest, exactNames, pngRecord, regularBytes, regularDirectory, treeFiles } from './files'
import { renderEnvironment } from './identity'
import { readBaselineManifest, readBaselineReview } from './manifest'

export const installedDirectory = (websiteRoot: string) => path.join(websiteRoot, 'tests', 'index.spec.ts-snapshots')
export const candidateImages = (directory: string) => path.join(directory, 'snapshots', 'index.spec.ts-snapshots')

export async function reviewCandidates(directory: string, websiteRoot: string, reviewer: string, notes: string, evidence: string[]) {
  if (!reviewer.trim() || !notes.trim() || !evidence.length) {
    throw new Error('审查必须包含审查者、结论与真实 PNG 证据')
  }
  const { sha256 } = await readBaselineManifest(directory, candidateImages(directory), websiteRoot, await renderEnvironment(websiteRoot))
  // 审查记录只能创建一次；改变候选需要重新采集和审查。
  const evidenceDirectory = path.join(directory, 'review-evidence')
  await mkdir(evidenceDirectory)
  const records = []
  for (const [index, file] of evidence.entries()) {
    const name = `review-${index + 1}.png`
    await pngRecord(path.dirname(file), path.basename(file))
    await cp(file, path.join(evidenceDirectory, name), { dereference: false, errorOnExist: true, force: false })
    records.push(await pngRecord(evidenceDirectory, name))
  }
  await writeFile(path.join(directory, 'review.json'), `${JSON.stringify({ version: 1, manifestSha256: sha256, reviewer, notes, reviewedAt: new Date().toISOString(), evidence: records }, null, 2)}\n`, { flag: 'wx' })
}

async function exists(file: string) {
  try {
    await lstat(file)
    return true
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return false
    }
    throw error
  }
}

async function registeredReceipt(websiteRoot: string, provenance: string, platform: string, mode: 'verify' | 'check' | 'publish' = 'verify') {
  await regularDirectory(path.join(websiteRoot, 'tests'))
  const registry = path.join(websiteRoot, 'tests', 'visual-baselines')
  if (mode === 'check' && !await exists(registry)) {
    return
  }
  if (mode === 'publish') {
    await mkdir(registry, { recursive: true })
  }
  await regularDirectory(registry)
  for (const [source, suffix] of [['manifest.json', '.json'], ['review.json', '.review.json']]) {
    const bytes = await regularBytes(path.join(provenance, source!))
    const target = path.join(registry, `${platform}${suffix}`)
    if (mode === 'check' && !await exists(target)) {
      continue
    }
    if (mode === 'publish' && !await exists(target)) {
      await writeFile(target, bytes, { flag: 'wx' })
    }
    if (digest(await regularBytes(target)) !== digest(bytes)) {
      throw new Error(`本地黄金图与已登记的基线审查不同：${target}`)
    }
  }
}

async function installedReceipt(target: string, websiteRoot: string, environment: Awaited<ReturnType<typeof renderEnvironment>>) {
  const provenance = path.join(target, 'provenance')
  const result = await readBaselineManifest(provenance, target, websiteRoot, environment, true)
  const review = await readBaselineReview(provenance, result.sha256)
  exactNames(await treeFiles(provenance), ['manifest.json', 'review.json', 'report.json', ...review.evidence.map(item => `review-evidence/${item.file}`)])
  return result
}

export async function installCandidates(directory: string, websiteRoot: string) {
  await regularDirectory(path.join(websiteRoot, 'tests'))
  const environment = await renderEnvironment(websiteRoot)
  const { sha256 } = await readBaselineManifest(directory, candidateImages(directory), websiteRoot, environment)
  await readBaselineReview(directory, sha256)
  const target = installedDirectory(websiteRoot)
  if (await exists(target)) {
    const previous = await installedReceipt(target, websiteRoot, environment)
    if (previous.sha256 !== sha256) {
      throw new Error('目标黄金目录已有其他基线，禁止覆盖；请先按归属归档旧目录')
    }
    await registeredReceipt(websiteRoot, directory, environment.platform, 'publish')
    return
  }
  const staging = await mkdtemp(path.join(path.dirname(target), '.visual-baseline-install-'))
  try {
    await cp(candidateImages(directory), staging, { recursive: true, dereference: false })
    for (const name of ['manifest.json', 'review.json', 'report.json', 'review-evidence']) {
      await mkdir(path.join(staging, 'provenance'), { recursive: true })
      await cp(path.join(directory, name), path.join(staging, 'provenance', name), { recursive: true, dereference: false })
    }
    await installedReceipt(staging, websiteRoot, environment)
    await registeredReceipt(websiteRoot, directory, environment.platform, 'check')
    await rename(staging, target)
    await registeredReceipt(websiteRoot, directory, environment.platform, 'publish')
  }
  finally {
    await rm(staging, { recursive: true, force: true })
  }
}

export async function verifyInstalledBaselines(websiteRoot: string) {
  const target = installedDirectory(websiteRoot)
  await regularBytes(path.join(target, 'provenance', 'manifest.json'))
  const environment = await renderEnvironment(websiteRoot)
  await installedReceipt(target, websiteRoot, environment)
  await registeredReceipt(websiteRoot, path.join(target, 'provenance'), environment.platform)
}
