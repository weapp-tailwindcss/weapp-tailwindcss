import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { gunzipSync } from 'node:zlib'
import { sameFilesystemPath } from '../gc-paths.mjs'
import { runtimeBindingDigest, sameRuntimeBindingReceipt, verifyRuntimeBinding } from './binding.mjs'
import { readBoundedFile, runtimeArtifactPath } from './bounded-file.mjs'
import { expectedRuntimePhases } from './request.mjs'

const maximumProfileBytes = 16 * 1024 * 1024
const maximumTotalBytes = 64 * 1024 * 1024
const sha256 = value => createHash('sha256').update(value).digest('hex')
function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}
function checkPhase(actual, expected) {
  assert(actual?.type === expected?.type && actual?.round === expected?.round && actual?.sequence === expected?.sequence, 'weapp runtime 快照与实际输出观察阶段不符')
}

/** 保留全部原始帧于 profile；摘要只按 scriptId 与 URL 字节哈希关联，不猜函数身份。 */
function inspectProfile(profile) {
  assert(profile && typeof profile === 'object' && profile.head, 'weapp runtime inspector profile 根缺失')
  const ids = new Set()
  const frames = new Map()
  const pending = [profile.head]
  let selfSize = 0
  while (pending.length) {
    const node = pending.pop()
    const frame = node?.callFrame
    assert(Number.isSafeInteger(node?.id) && node.id >= 0 && !ids.has(node.id) && Number.isFinite(node.selfSize) && node.selfSize >= 0 && Array.isArray(node.children) && typeof frame?.functionName === 'string' && typeof frame.url === 'string' && typeof frame.scriptId === 'string' && Number.isSafeInteger(frame.lineNumber) && Number.isSafeInteger(frame.columnNumber), 'weapp runtime inspector profile 节点或帧结构无效')
    ids.add(node.id)
    assert(ids.size <= 100000, 'weapp runtime profile 节点数超过固定上限')
    selfSize += node.selfSize
    assert(Number.isFinite(selfSize), 'weapp runtime profile 字节统计溢出')
    const urlSha256 = sha256(Buffer.from(frame.url))
    const key = JSON.stringify([frame.scriptId, urlSha256])
    let record = frames.get(key)
    if (!record) {
      assert(frames.size < 16384, 'weapp runtime profile 脚本身份超过固定上限')
      record = {
        scriptId: frame.scriptId,
        urlSha256,
        urlUtf8Bytes: Buffer.byteLength(frame.url),
        frameCount: 0,
        selfSize: 0,
      }
      frames.set(key, record)
    }
    record.frameCount++
    record.selfSize += node.selfSize
    for (const child of node.children) {
      pending.push(child)
    }
  }
  assert(profile.samples === undefined || Array.isArray(profile.samples), 'weapp runtime inspector samples 结构无效')
  let samplesWithoutNode = 0
  for (const sample of profile.samples ?? []) {
    assert(Number.isSafeInteger(sample?.nodeId) && sample.nodeId >= 0 && Number.isFinite(sample.size) && sample.size >= 0 && Number.isSafeInteger(sample.ordinal) && sample.ordinal >= 0, 'weapp runtime inspector sample 无效')
    if (!ids.has(sample.nodeId)) {
      samplesWithoutNode++
    }
  }
  return {
    nodes: ids.size,
    selfSize,
    samplesWithoutNode,
    scripts: [...frames.values()],
  }
}

/** 验证传输完整性；不把诊断样本用于性能预算或存活泄漏判断。 */
export async function verifyRuntimeEvidence(directory, identity, checkpoints) {
  directory = await fs.realpath(directory)
  const budget = {
    bytes: 0,
    maximumBytes: maximumTotalBytes,
  }
  const names = new Set()
  async function read(name, receipt, maximum = maximumProfileBytes) {
    assert(typeof name === 'string' && path.basename(name) === name && !names.has(name), 'weapp runtime 工件文件名越界或重复')
    names.add(name)
    return readBoundedFile(runtimeArtifactPath(directory, name), {
      maximumBytes: maximum,
      receipt,
      budget,
    })
  }
  const bindingReceipt = verifyRuntimeBinding(identity.binding, identity)
  assert(sameRuntimeBindingReceipt(bindingReceipt, identity.bindingReceipt), 'weapp runtime 完整会话绑定回执不符')
  const status = JSON.parse((await read('status.json', undefined, 1024 * 1024)).toString('utf8'))
  assert(!status.firstFailure, `weapp runtime worker 首败：${status.firstFailure}`)
  const startup = JSON.parse((await read('process-start.json', undefined, 256 * 1024)).toString('utf8'))
  assert(sameFilesystemPath(startup.actualEntry, identity.expectedEntry) && startup.entrySha256 === identity.expectedEntrySha256 && startup.manifestSha256 === identity.manifestSha256, 'weapp runtime 未绑定真实业务 bin 或包声明已变化')
  for (const name of ['role', 'version', 'project', 'sourceCommit', 'sourceWorkingTreeStatus', 'expectedEntrySha256', 'manifestSha256']) {
    assert(startup.identity?.[name] === identity[name], `weapp runtime 完整会话身份不符：${name}`)
  }
  assert(sameFilesystemPath(startup.identity?.root ?? '', identity.root) && sameFilesystemPath(startup.identity?.sessionDirectory ?? '', identity.sessionDirectory), 'weapp runtime 会话物理根不符')
  assert(runtimeBindingDigest(startup.identity?.binding) === bindingReceipt.sha256 && sameRuntimeBindingReceipt(bindingReceipt, startup.bindingReceipt), 'weapp runtime startup product/lock/driver 身份不符')
  assert(Number.isInteger(startup.pid) && startup.pid === status.pid, 'weapp runtime 业务进程身份不一致')
  assert(Object.keys(startup.moduleHashes ?? {}).length === Object.keys(identity.moduleHashes).length && Object.entries(identity.moduleHashes).every(([name, hash]) => startup.moduleHashes[name] === hash), 'weapp runtime preload 模块哈希不符')
  assert(status.complete === true && !status.firstFailure && sameFilesystemPath(status.actualEntry, identity.expectedEntry), 'weapp runtime 存在首败或末尾证据不完整')
  assert(Array.isArray(status.snapshots) && status.snapshots.length === 8 && checkpoints.length === 8, 'weapp runtime 必须具有八份输出观察/停止快照')
  const expected = expectedRuntimePhases()
  const profiles = []
  for (const [index, snapshot] of status.snapshots.entries()) {
    const checkpoint = checkpoints[index]
    assert(snapshot.sequence === index + 1 && checkpoint.sequence === index + 1 && checkpoint.type === expected[index][0] && checkpoint.round === expected[index][1], 'weapp runtime 固定阶段顺序损坏')
    checkPhase(snapshot.phase, checkpoint)
    assert(snapshot.file === `profile-${index + 1}.json.gz` && snapshot.receipt?.encoding === 'gzip-json', 'weapp runtime profile 格式未登记')
    assert(Number.isSafeInteger(snapshot.receipt.uncompressedBytes) && snapshot.receipt.uncompressedBytes <= maximumTotalBytes, 'weapp runtime profile 逻辑尺寸无效')
    const raw = await read(snapshot.file, snapshot.receipt)
    const decoded = gunzipSync(raw, {
      maxOutputLength: maximumTotalBytes,
    })
    assert(decoded.length === snapshot.receipt.uncompressedBytes, 'weapp runtime profile 实际解压尺寸不符')
    const document = JSON.parse(decoded.toString('utf8'))
    assert(document.pid === startup.pid && document.sequence === snapshot.sequence, 'weapp runtime profile 序列与回执不符')
    checkPhase(document.phase, checkpoint)
    const sampling = document.sampling
    assert(sampling?.parameters?.samplingInterval === 256 * 1024 && sampling.parameters.includeObjectsCollectedByMajorGC === true && sampling.parameters.includeObjectsCollectedByMinorGC === true && sampling.sampledAllocatedBytesIncludingCollected === true, 'weapp runtime inspector 分配协议与固定参数不符')
    const frameSummary = inspectProfile(sampling.profile)
    profiles.push({
      file: snapshot.file,
      receipt: snapshot.receipt,
      phase: snapshot.phase,
      frameSummary,
    })
  }
  assert(Array.isArray(status.eventFiles) && status.eventFiles.length === 2, 'weapp runtime 模块与自然 GC 事件账本缺失')
  const events = []
  const parsedScripts = new Map()
  for (const item of status.eventFiles) {
    assert(['modules.ndjson', 'gc.ndjson'].includes(item.file), 'weapp runtime 事件文件名未登记')
    const raw = await read(item.file, item.receipt)
    const text = raw.toString('utf8')
    assert(text === '' || text.endsWith('\n'), 'weapp runtime NDJSON 末行不完整')
    const records = text.trimEnd() ? text.trimEnd().split('\n').map(line => JSON.parse(line)) : []
    if (item.file === 'modules.ndjson') {
      const types = new Set(records.map(record => record.type))
      assert(['node.resolve', 'node.load', 'v8.script-parsed'].every(type => types.has(type)), 'weapp runtime 缺少实际模块解析/load/V8 parsed 事件')
      for (const record of records.filter(item => item.type === 'v8.script-parsed')) {
        assert(typeof record.scriptId === 'string' && typeof record.url === 'string' && !parsedScripts.has(record.scriptId), 'weapp runtime V8 parsed 脚本身份重复或无效')
        parsedScripts.set(record.scriptId, {
          urlSha256: sha256(Buffer.from(record.url)),
          sourceScope: record.sourceScope,
        })
      }
    }
    else {
      assert(records[0]?.type === 'observer-start', 'weapp runtime 自然 GC observer 启动证据缺失')
    }
    assert(item.receipt.events === records.length, 'weapp runtime 事件数量与回执不符')
    events.push({
      file: item.file,
      receipt: item.receipt,
    })
  }
  for (const profile of profiles) {
    for (const script of profile.frameSummary.scripts) {
      const parsed = parsedScripts.get(script.scriptId)
      script.attribution = !parsed ? 'unknown：未匹配到本会话 V8 parsed' : parsed.urlSha256 === script.urlSha256 ? 'scriptId 与 URL 字节匹配；未映射生成函数' : 'scriptId 匹配但 URL 拼写不同；保留未知边界'
      if (parsed) {
        script.parsedEventRef = {
          file: 'modules.ndjson',
          scriptId: script.scriptId,
        }
      }
    }
  }
  return {
    pid: startup.pid,
    nodeVersion: startup.nodeVersion,
    profiles,
    events,
    bytes: budget.bytes,
    bindingReceipt,
    diagnosticOnly: true,
    budgetAcceptance: false,
    interpretation: '只验证传输、真实 bin、协议和输出观察阶段；模块解析/load/V8 parsed 均非函数执行证明，分配含已回收对象，自然 GC 零事件不代表未发生 GC。',
  }
}
