import type { NativePlatformReport, Platform } from '../../examples/react-lynx/src/compatibility/types'
import { createHash } from 'node:crypto'
import { constants, createReadStream } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { readNativeReport } from './reports'

const platforms = ['ios', 'android'] as const
const indexName = 'archive-index.json'

interface ArchiveFile {
  path: string[]
  sha256: string
  byteLength: number
}

interface ArchiveIndex {
  version: 1
  catalogHash: string
  platforms: Record<Platform, { report: string[], runId: string, bundleSha256: string }>
  artifacts: ArchiveFile[]
}

function assertPath(segments: unknown): asserts segments is string[] {
  if (!Array.isArray(segments) || !segments.length || segments.some(segment => typeof segment !== 'string' || !segment || segment === '.' || segment === '..' || /[\\/:\0]/.test(segment))) {
    throw new Error('Lynx baseline 归档只允许相对路径片段')
  }
}

async function files(directory: string, prefix: string[] = []): Promise<string[][]> {
  const result: string[][] = []
  const entries = await fs.readdir(path.join(directory, ...prefix), { withFileTypes: true })
  entries.sort((first, second) => first.name < second.name ? -1 : first.name > second.name ? 1 : 0)
  for (const entry of entries) {
    const segments = [...prefix, entry.name]
    assertPath(segments)
    if (entry.isDirectory()) {
      result.push(...await files(directory, segments))
    }
    else if (entry.isFile()) {
      result.push(segments)
    }
    else {
      throw new Error('Lynx baseline 原始目录包含符号链接或非普通文件')
    }
  }
  return result
}

async function snapshot(directory: string): Promise<ArchiveFile[]> {
  const artifacts: ArchiveFile[] = []
  for (const segments of await files(directory)) {
    if (segments.length === 1 && segments[0] === indexName) {
      continue
    }
    const hash = createHash('sha256')
    let byteLength = 0
    for await (const bytes of createReadStream(path.join(directory, ...segments))) {
      hash.update(bytes)
      byteLength += bytes.length
    }
    artifacts.push({ path: segments, sha256: hash.digest('hex'), byteLength })
  }
  return artifacts
}

/** 只从归档内的相对路径重读；本机下载目录和 tracked 历史 JSON 均不能补证。 */
export async function validateNativeBaselineArchive(directory: string) {
  const index = JSON.parse(await fs.readFile(path.join(directory, indexName), 'utf8')) as ArchiveIndex
  if (index.version !== 1 || !/^[a-f\d]{64}$/.test(index.catalogHash)
    || !isDeepStrictEqual(Object.keys(index.platforms ?? {}).sort(), [...platforms].sort()) || !Array.isArray(index.artifacts)) {
    throw new Error('Lynx baseline 归档索引缺少完整双端身份')
  }
  for (const artifact of index.artifacts) {
    assertPath(artifact.path)
    if (!/^[a-f\d]{64}$/.test(artifact.sha256) || !Number.isSafeInteger(artifact.byteLength) || artifact.byteLength < 0) {
      throw new Error('Lynx baseline 归档回执无效')
    }
  }
  if (!isDeepStrictEqual(await snapshot(directory), index.artifacts)) {
    throw new Error('Lynx baseline 原始归档文件缺失、增加或摘要不符')
  }
  const reports = {} as Record<Platform, NativePlatformReport>
  for (const platform of platforms) {
    const identity = index.platforms[platform]
    assertPath(identity.report)
    if (identity.report.length !== 2 || identity.report[0] !== platform) {
      throw new Error('Lynx baseline 报告路径不属于登记的平台目录')
    }
    const report = await readNativeReport(path.join(directory, ...identity.report), platform)
    if (report.catalogHash !== index.catalogHash || report.evidence?.runId !== identity.runId || report.evidence.bundleSha256 !== identity.bundleSha256) {
      throw new Error('Lynx baseline 归档报告与登记身份不符')
    }
    reports[platform] = report
  }
  return { index, reports }
}

/** 先保存完整双端原始运行目录并从副本验真，再允许更新历史结论文件。 */
export async function archiveNativeBaseline(inputs: Record<Platform, { file: string, report: NativePlatformReport }>, archiveRoot: string) {
  const roots = {} as Record<Platform, string>
  for (const platform of platforms) {
    roots[platform] = await fs.realpath(path.dirname(path.resolve(inputs[platform].file)))
  }
  await fs.mkdir(archiveRoot, { recursive: true })
  const canonicalRoot = await fs.realpath(archiveRoot)
  for (const source of Object.values(roots)) {
    const relative = path.relative(source, canonicalRoot)
    if (!relative || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))) {
      throw new Error('Lynx baseline 归档目录不能放在原始输入目录内')
    }
  }
  const directory = await fs.mkdtemp(path.join(canonicalRoot, 'baseline-'))
  try {
    const identities = {} as ArchiveIndex['platforms']
    for (const platform of platforms) {
      const input = inputs[platform]
      for (const segments of await files(roots[platform])) {
        const destination = path.join(directory, platform, ...segments)
        await fs.mkdir(path.dirname(destination), { recursive: true })
        await fs.copyFile(path.join(roots[platform], ...segments), destination, constants.COPYFILE_EXCL)
      }
      if (!input.report.evidence) {
        throw new Error('Lynx baseline 原始报告缺少 evidence 身份')
      }
      identities[platform] = { report: [platform, path.basename(input.file)], runId: input.report.evidence.runId, bundleSha256: input.report.evidence.bundleSha256 }
    }
    const index: ArchiveIndex = { version: 1, catalogHash: inputs.ios.report.catalogHash, platforms: identities, artifacts: await snapshot(directory) }
    const indexPath = path.join(directory, indexName)
    await fs.writeFile(indexPath, `${JSON.stringify(index, null, 2)}\n`, { flag: 'wx' })
    const replayed = await validateNativeBaselineArchive(directory)
    if (!platforms.every(platform => isDeepStrictEqual(replayed.reports[platform], inputs[platform].report))) {
      throw new Error('Lynx baseline 归档期间原始报告发生变化')
    }
    return { directory, indexPath }
  }
  catch (error) {
    try {
      await fs.rm(directory, { recursive: true, force: true })
    }
    catch (cleanup) {
      throw new AggregateError([error, cleanup], 'Lynx baseline 归档失败且无法清理本轮副本')
    }
    throw error
  }
}
