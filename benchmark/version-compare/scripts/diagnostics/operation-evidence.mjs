import fs from 'node:fs/promises'
import path from 'node:path'
import { limits } from './constants.mjs'
import { rootRelativeKey, sha256 } from './evidence.mjs'

/** 控制器逐份复核全文引用；不以缺失或截断记录证明没有操作。 */
export async function verifyOperationEvidence(directory, status, identity = {}) {
  const files = (await fs.readdir(directory)).filter(name => /^(?:process-start|inputs-\d+|allocation-(?:frames-)?\d+|operation-\d+|text-[a-f\d]{64})\.json$/.test(name))
  let bytes = 0
  for (const file of files) {
    const size = (await fs.stat(path.join(directory, file))).size
    bytes += size
    if (size > limits.maxProfileBytes || bytes > limits.maxTotalBytes) {
      throw new Error('Mpx 工件超过文件或会话总量上限')
    }
  }
  if (bytes !== status.bytesWritten || files.length !== status.filesWritten) {
    throw new Error('Mpx 工件总量与最后状态不一致')
  }
  const names = files.filter(name => /^operation-\d+\.json$/.test(name))
  names.sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]))
  if (!names.length || names.length > limits.maxOperationEvents || status.operations?.recordingError || names.length !== status.operations?.events) {
    throw new Error('Mpx 操作记录缺失、超限或失败')
  }
  const texts = new Map()
  const events = []
  async function verify(value) {
    if (!value || typeof value !== 'object') {
      return
    }
    if (value.text?.file) {
      const reference = value.text
      if (reference.file !== `text-${reference.sha256}.json`) {
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
        texts.set(reference.file, reference.sha256)
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
        throw new Error('Mpx 操作完成缺少对应开始或重复完成')
      }
      pending.delete(event.details.operationId)
    }
  }
  if (pending.size) {
    throw new Error('Mpx 操作缺少完成证据')
  }
  const requiredOperations = ['webpack.created', 'webpack.completed', 'scan.source', 'generator.generate.success', 'native.create.success', 'native.generate.success', 'engine.compile.success', 'engine.build.success']
  if (identity.capabilities?.compilerServicePool.available) {
    requiredOperations.push('service.lookup.start', 'service.create.start', 'acquire.key.success', 'request.key.success', 'acquire.sourceSnapshot.success', 'request.snapshot.success', 'result.copy.success')
  }
  for (const required of requiredOperations) {
    if (!events.some(event => event.name === required)) {
      throw new Error(`Mpx 必需操作证据缺失：${required}`)
    }
  }
  const count = name => events.filter(event => event.name === name).length
  if (count('webpack.created') !== status.webpackCreatedCount || count('webpack.completed') !== status.webpackCompletedCount) {
    throw new Error('Mpx 编译次数与最后状态不一致')
  }
  return {
    events: events.length,
    textFiles: texts.size,
    webpackCreated: count('webpack.created'),
    webpackCompleted: count('webpack.completed'),
    snapshotCount: status.snapshotCount,
    capabilities: identity.capabilities,
    lifecycleBoundary: '按实际调用记录；watch-stop 仅停止采样。关闭尾部可能缺失，不以创建减释放推断泄漏或原生内存释放。',
    inputFiles: events.filter(event => ['scan.source', 'generator.generate.start', 'native.generate.start', 'webpack.completed', 'scan.signature'].includes(event.name)).map(event => `operation-${event.sequence}.json`),
  }
}

function normalizeInput(value, root, platform, key = '') {
  if (typeof value === 'string') {
    return ['file', 'base', 'root', 'outDir', 'projectRoot', 'baseFallbacks', 'dependencies', 'excludeFiles', 'config', 'filePath'].includes(key)
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
    .filter(([name]) => !['sessionId', 'compilationId', 'poolId', 'startedPhase', 'sourceKey'].includes(name))
    .map(([name, item]) => [name, normalizeInput(item, root, platform, name)]))
}

export function compareOperationInputs(base, current) {
  function values(controller) {
    return controller.operationEvidence.inputs.map(event => ({
      name: event.name,
      phase: { type: event.phase.type.replace(/-observed$/, '-write'), round: event.phase.round },
      details: normalizeInput(event.details, controller.identity.root, controller.identity.platform),
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
