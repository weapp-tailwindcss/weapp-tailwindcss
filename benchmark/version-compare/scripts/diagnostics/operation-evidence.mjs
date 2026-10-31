import fs from 'node:fs/promises'
import path from 'node:path'
import { limits, mpxProject, weappViteInputProject } from './constants.mjs'
import { isOperationEvidenceFilename, rootRelativeKey, sha256 } from './evidence.mjs'
import { verifyViteCompletions, verifyWebpackCompletions } from './operation-completions.mjs'
import { verifyServiceEvidence } from './service-evidence.mjs'
import { verifyUniInputEvidence } from './uni-evidence.mjs'
import { uniInputProject } from './uni-observer.mjs'

// 只排除事件 details 顶层的进程内身份；同名用户输入和不透明引用仍完整比较。
const operationMetadataFields = new Set(['engineId', 'nativePoolId', 'serviceGeneratorId', 'generatorId', 'leaseId', 'ownerId', 'sessionId', 'compilationId', 'poolId', 'startedPhase', 'sourceKey', 'storeId', 'finalizationId', 'bundleId'])

/** 控制器逐份复核全文引用；不以缺失或截断记录证明没有操作。 */
export async function verifyOperationEvidence(directory, status, identity = {}) {
  const files = (await fs.readdir(directory)).filter(isOperationEvidenceFilename)
  if (files.includes('operation-terminal.json')) {
    throw new Error('操作录制存在首败回执，证据未完成')
  }
  let bytes = 0
  for (const file of files) {
    const size = (await fs.stat(path.join(directory, file))).size
    bytes += size
    if (size > limits.maxProfileBytes || bytes > limits.maxTotalBytes) {
      throw new Error('操作工件超过文件或会话总量上限')
    }
  }
  if (bytes !== status.bytesWritten || files.length !== status.filesWritten) {
    throw new Error('操作工件总量与最后状态不一致')
  }
  const names = files.filter(name => /^operation-\d+\.json$/.test(name))
  names.sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]))
  if (!names.length || names.length > limits.maxOperationEvents || status.operations?.recordingError || names.length !== status.operations?.events) {
    throw new Error('操作记录缺失、超限或失败')
  }
  const texts = new Map()
  const events = []
  async function verify(value) {
    if (!value || typeof value !== 'object') {
      return
    }
    if (value.text?.file) {
      const reference = value.text
      if (!/^[a-f\d]{64}$/.test(reference.sha256) || reference.file !== `text-${reference.sha256}.json`) {
        throw new Error('来源全文引用路径不匹配')
      }
      if (!texts.has(reference.file)) {
        const raw = await fs.readFile(path.join(directory, reference.file))
        if (raw.length !== reference.receipt.bytes || sha256(raw) !== reference.receipt.sha256) {
          throw new Error('来源全文工件哈希不匹配')
        }
        const stored = JSON.parse(raw)
        if (typeof stored.text !== 'string' || stored.text.length !== reference.utf16Length || sha256(stored.text) !== reference.sha256) {
          throw new Error('来源全文内容哈希不匹配')
        }
        texts.set(reference.file, { sha256: reference.sha256, receipt: { bytes: raw.length, sha256: sha256(raw) }, utf16Length: stored.text.length })
      }
      const stored = texts.get(reference.file)
      if (reference.sha256 !== stored.sha256 || reference.utf16Length !== stored.utf16Length
        || reference.receipt?.bytes !== stored.receipt.bytes || reference.receipt?.sha256 !== stored.receipt.sha256) {
        throw new Error('来源全文重复引用元数据不匹配')
      }
    }
    for (const item of Object.values(value)) {
      await verify(item)
    }
  }
  for (const [index, name] of names.entries()) {
    const raw = await fs.readFile(path.join(directory, name))
    if (raw.length > limits.maxProfileBytes) {
      throw new Error('操作记录超过单文件上限')
    }
    const event = JSON.parse(raw)
    if (event.sequence !== index + 1) {
      throw new Error('操作序列缺失或重复')
    }
    await verify(event.details)
    events.push(event)
  }
  const pending = new Map()
  for (const event of events) {
    if (event.name.endsWith('.start')) {
      pending.set(event.sequence, event.name.slice(0, -6))
    }
    else if (/\.(?:success|failure)$/.test(event.name)) {
      if (pending.get(event.details.operationId) !== event.name.replace(/\.(?:success|failure)$/, '')) {
        throw new Error('操作完成缺少对应开始或重复完成')
      }
      pending.delete(event.details.operationId)
    }
  }
  if (pending.size) {
    throw new Error('操作缺少完成证据')
  }
  const webpack = identity.project === undefined || identity.project === mpxProject
  const weappViteInput = identity.project === weappViteInputProject && identity.mode === 'inputs'
  const requiredOperations = weappViteInput
    ? ['generator.generate.start', 'generator.generate.success', 'native.create.success', 'native.generate.success', 'engine.compile.success', 'engine.build.start', 'engine.build.success']
    : [...(webpack ? ['webpack.created', 'webpack.completed', 'scan.source'] : ['vite.completed', 'source.snapshot']), 'generator.generate.success', 'native.create.success', 'native.generate.success', 'engine.compile.success', 'engine.build.success']
  if (identity.capabilities?.compilerServicePool.available) {
    requiredOperations.push('service.lookup.start', 'service.create.start', 'service.acquire', 'acquire.key.success', 'request.key.success', 'acquire.sourceSnapshot.success', 'request.snapshot.success', 'result.copy.success')
  }
  for (const required of requiredOperations) {
    if (!events.some(event => event.name === required)) {
      throw new Error(`必需操作证据缺失：${required}`)
    }
  }
  if (weappViteInput) {
    const hasScan = events.some(event => event.name === 'raw-generation.candidates')
    const hasCacheReuse = events.some(event => event.name === 'generator.cache' && event.details?.cacheHit === true)
    if (!hasScan && !hasCacheReuse) {
      throw new Error('weapp-vite input-only 缺少 raw-generation 输入或明确 cacheHit 复用证据')
    }
    if (identity.kind === 'build') {
      const completions = events.filter(event => event.name === 'weapp-vite.completed')
      if (completions.length !== 1 || completions[0].details?.kind !== 'build' || completions[0].details?.sessionClosed !== true || status.weappViteCompletedCount !== 1) {
        throw new Error('weapp-vite input-only 缺少唯一 session.close 后生产完成证据')
      }
    }
  }
  const count = name => events.filter(event => event.name === name).length
  const snapshots = []
  for (const file of files.filter(file => /^inputs-\d+\.json$/.test(file))) {
    snapshots.push([file, JSON.parse(await fs.readFile(path.join(directory, file), 'utf8'))])
  }
  if (!weappViteInput && snapshots.length !== status.snapshotCount) {
    throw new Error('阶段快照数量与最后状态不一致')
  }
  const completions = weappViteInput
    ? { weappViteInput: { generationCount: count('raw-generation.candidates'), buildCount: count('engine.build.success') } }
    : (webpack ? verifyWebpackCompletions : verifyViteCompletions)(events, snapshots, status)
  const serviceEvidence = verifyServiceEvidence(events)
  const uniInput = identity.project === uniInputProject && identity.mode === 'inputs' ? await verifyUniInputEvidence(directory, status.uniInput, events) : undefined
  const phaseCounts = new Map()
  for (const event of events) {
    const key = `${event.phase.type}:${event.phase.round ?? ''}`
    const entry = phaseCounts.get(key) ?? { phase: { type: event.phase.type, round: event.phase.round }, operations: {} }
    entry.operations[event.name] = (entry.operations[event.name] ?? 0) + 1
    phaseCounts.set(key, entry)
  }
  return {
    events: events.length,
    textFiles: texts.size,
    ...completions,
    operationCounts: Object.fromEntries([...new Set(events.map(event => event.name))].map(name => [name, count(name)])),
    phaseCounts: [...phaseCounts.values()],
    snapshotCount: status.snapshotCount,
    serviceEvidence,
    ...(uniInput ? { uniInput } : {}),
    capabilities: identity.capabilities,
    lifecycleBoundary: '按实际调用记录；watch-stop 仅停止采样。关闭尾部可能缺失，不以创建减释放推断泄漏或原生内存释放。',
    inputFiles: events.filter(event => ['scan.source', 'generator.generate.start', 'generator.cache', 'native.generate.start', 'webpack.completed', 'scan.signature', 'source.snapshot', 'vite.completed', 'engine.build.start', 'raw-generation.scan.start', 'raw-generation.candidates'].includes(event.name) || (uniInput && ['uni.bundle.input', 'uni.snapshot', 'uni.plan', 'uni.cache', 'uni.selection'].includes(event.name))).map(event => `operation-${event.sequence}.json`),
  }
}

function normalizeInput(value, root, platform, key = '') {
  if (typeof value === 'string') {
    return ['file', 'base', 'root', 'outDir', 'projectRoot', 'baseFallbacks', 'dependencies', 'excludeFiles', 'config', 'filePath', 'sourceFile', 'outputFile', 'generatorSourceFile', 'assetSourceFile', 'rootImportShellTarget', 'usedConfiguredSourceFiles', 'usedConfiguredSourceFile'].includes(key)
      ? rootRelativeKey(value, root, platform)
      : value
  }
  if (Array.isArray(value)) {
    return value.map(item => normalizeInput(item, root, platform, key))
  }
  if (!value || typeof value !== 'object') {
    return value
  }
  if (value.text) {
    return { textSha256: value.text.sha256 }
  }
  return Object.fromEntries(Object.entries(value)
    .map(([name, item]) => [name, normalizeInput(item, root, platform, name)]))
}

export function compareOperationInputs(base, current) {
  function values(controller) {
    return controller.operationEvidence.inputs.map(event => ({
      name: event.name,
      phase: { type: event.phase.type.replace(/-observed$/, '-write'), round: event.phase.round },
      details: normalizeInput(Object.fromEntries(Object.entries(event.details).filter(([name]) => !operationMetadataFields.has(name))), controller.identity.root, controller.identity.platform),
    }))
  }
  const beforeValues = values(base).map(value => JSON.stringify(value))
  const afterValues = values(current).map(value => JSON.stringify(value))
  const opaqueInputs = [...beforeValues, ...afterValues].some(value => value.includes('"comparableAcrossWorkers":false'))
  const before = beforeValues.map(sha256)
  const after = afterValues.map(sha256)
  return {
    sameRecordedOperationsAndInputs: !opaqueInputs && JSON.stringify(before) === JSON.stringify(after),
    opaqueInputs,
    baselineCount: before.length,
    currentCount: after.length,
    differences: Array.from({ length: Math.max(before.length, after.length) }).flatMap((_, index) => before[index] === after[index]
      ? []
      : [{
          index,
          baselineFile: base.operationEvidence.inputFiles[index],
          currentFile: current.operationEvidence.inputFiles[index],
          baselineSha256: before[index],
          currentSha256: after[index],
        }]),
    interpretation: '保留实际调用次数和顺序；只归一化结构化已知根路径，全文哈希不变。函数及不透明对象身份不用于跨进程证明闭包相等。',
  }
}
