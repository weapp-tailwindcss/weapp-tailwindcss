import type { NativePlatformReport } from '../../../examples/react-lynx/src/compatibility/types'
import type { RunContext } from '../context'
import type { ArtifactReceipt, CaseContract } from '../types'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { readEvidenceContext } from '../../lynx/evidence'
import { digest } from '../identity'
import { receipt } from '../report'

/** 原始报告、独立运行身份和实际 bundle 必须一致；不从 checkpoint 布尔值推导身份。 */
export async function lynxArtifactReceipts(context: RunContext, raw: NativePlatformReport, contracts: readonly CaseContract[]) {
  if (!context.startedAt || !Number.isFinite(Date.parse(context.startedAt))) {
    throw new Error('缺少调用者记录的本轮开始时间，不能验证原生产物新鲜度')
  }
  const directory = path.join(context.directory, 'native')
  const identity = await readEvidenceContext(directory)
  if (identity.runId !== context.runId || raw.evidence?.runId !== context.runId
    || raw.evidence.bundleSha256 !== identity.bundleSha256) {
    throw new Error('Lynx 原始证据不属于本轮 run ID 或实际 bundle')
  }
  const stored = JSON.parse(await readFile(path.join(directory, 'report.json'), 'utf8'))
  if (!isDeepStrictEqual(stored, raw)) {
    throw new Error('Lynx 输入结论与归档原始报告不一致')
  }
  if (!Number.isFinite(Date.parse(raw.verifiedAt)) || Date.parse(raw.verifiedAt) < Date.parse(context.startedAt)) {
    throw new Error('Lynx 原始报告早于本轮执行')
  }
  const receipts: ArtifactReceipt[] = []
  const ids = contracts.map(item => item.id)
  async function collect(current: string) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const file = path.join(current, entry.name)
      if (entry.isSymbolicLink()) {
        throw new Error(`Lynx 原始产物不能使用符号链接：${path.relative(directory, file)}`)
      }
      if (entry.isDirectory()) {
        await collect(file)
      }
      else if (entry.isFile()) {
        const extension = path.extname(file).toLowerCase()
        const owners = extension === '.png' ? ids.filter(id => entry.name.startsWith(`${id}-`)) : ids
        if (!owners.length) {
          continue
        }
        const kind = extension === '.png'
          ? 'screenshot'
          : extension === '.bundle'
            ? 'bundle'
            : extension === '.css' ? 'css' : ['.txt', '.log'].includes(extension) ? 'log' : 'measurements'
        receipts.push(await receipt(file, context.directory, context.runId, owners, kind))
      }
    }
  }
  await collect(directory)
  return receipts
}

/** 专用效果判定器只解码清单中已与真实字节核对的固定帧。 */
export async function readLynxFrame(context: RunContext, raw: NativePlatformReport, name: string) {
  if (!/^[a-z0-9-]+\.png$/.test(name)) {
    throw new Error('Lynx 截图名不是固定帧名称')
  }
  const entries = raw.evidence?.artifacts.filter(item => item.name === name) ?? []
  if (entries.length !== 1 || entries[0]!.runId !== context.runId) {
    throw new Error(`Lynx 缺少唯一的本轮截图回执：${name}`)
  }
  const bytes = await readFile(path.join(context.directory, 'native', 'crops', context.runId, name))
  if (bytes.byteLength !== entries[0]!.byteLength || digest(bytes) !== entries[0]!.sha256) {
    throw new Error(`Lynx 截图字节与原生回执不一致：${name}`)
  }
  const { PNG } = await import('../../lynx/png')
  return PNG.sync.read(bytes)
}
