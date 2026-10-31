import fs from 'node:fs/promises'
import path from 'node:path'
import { weappViteInputProject } from './constants.mjs'
import { compareOperationInputs } from './operation-evidence.mjs'

function origins(input, candidate) {
  return input.sources.flatMap(store => Object.entries(store.maps).flatMap(([layer, entries]) => {
    if (layer !== 'candidatesById' && !layer.endsWith('CandidatesById')) {
      return []
    }
    return entries.filter(entry => entry.candidates.includes(candidate)).map(entry => ({
      storeId: store.storeId,
      layer,
      key: entry.key,
      comparableKey: entry.comparableKey,
      sourceHashes: Object.entries(store.maps).filter(([name]) => name.endsWith('SourceById') || name === 'sourceById').flatMap(([name, sources]) => sources.filter(source => source.key === entry.key).map(source => ({ layer: name, sha256: source.sha256 }))),
    }))
  }))
}

function sourceHashes(input) {
  const result = new Map()
  for (const store of input.sources) {
    for (const [layer, sources] of Object.entries(store.maps)) {
      if (!layer.endsWith('SourceById') && layer !== 'sourceById') {
        continue
      }
      for (const source of sources) {
        const key = `${layer}\0${source.comparableKey}`
        const hashes = result.get(key) ?? new Set()
        hashes.add(source.sha256)
        result.set(key, hashes)
      }
    }
  }
  return result
}

export function compareInputSnapshots(base, current) {
  const candidateDifferences = []
  for (const name of new Set([...Object.keys(base.compilationCandidates ?? {}), ...Object.keys(current.compilationCandidates ?? {})])) {
    const before = new Set(base.compilationCandidates?.[name] ?? [])
    const after = new Set(current.compilationCandidates?.[name] ?? [])
    const added = [...after].filter(value => !before.has(value))
    const removed = [...before].filter(value => !after.has(value))
    if (added.length || removed.length) {
      candidateDifferences.push({
        collection: name,
        added: added.map(value => ({ value, origins: origins(current, value) })),
        removed: removed.map(value => ({ value, origins: origins(base, value) })),
      })
    }
  }
  const before = sourceHashes(base)
  const after = sourceHashes(current)
  const sourceDifferences = [...new Set([...before.keys(), ...after.keys()])].flatMap((key) => {
    const baselineHashes = [...before.get(key) ?? []].sort()
    const currentHashes = [...after.get(key) ?? []].sort()
    return JSON.stringify(baselineHashes) === JSON.stringify(currentHashes) ? [] : [{ key, baselineHashes, currentHashes }]
  })
  return {
    sameActualCandidatesAndSourceHashes: candidateDifferences.length === 0 && sourceDifferences.length === 0,
    candidateDifferences,
    sourceDifferences,
    sourceIdentityRule: '仅归一化来源 key 的已知工程根；实际源码哈希不忽略路径文字、marker 或其他内容差异',
  }
}

export async function compareDiagnosticInputs(directory) {
  const sessions = []
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue
    }
    const folder = path.join(directory, entry.name)
    const controller = JSON.parse(await fs.readFile(path.join(folder, 'allocation-controller.json'), 'utf8'))
    sessions.push({ folder, controller })
  }
  const comparisons = []
  const operationComparisons = []
  for (const base of sessions.filter(session => session.controller.identity.role === 'base')) {
    const identity = base.controller.identity
    const inputOnly = identity.project === weappViteInputProject && identity.mode === 'inputs'
    const current = sessions.find(session => session.controller.identity.role === 'current'
      && session.controller.identity.kind === identity.kind && session.controller.identity.run === identity.run)
    if (!current) {
      throw new Error('诊断缺失当前版本的对应会话')
    }
    if (base.controller.operationEvidence || current.controller.operationEvidence) {
      if (!base.controller.operationEvidence || !current.controller.operationEvidence) {
        throw new Error('Mpx 双侧操作证据不完整')
      }
      for (const session of [base, current]) {
        session.controller.operationEvidence.inputs = await Promise.all(session.controller.operationEvidence.inputFiles.map(file => fs.readFile(path.join(session.folder, file), 'utf8').then(JSON.parse)))
      }
      operationComparisons.push({ kind: identity.kind, run: identity.run, ...compareOperationInputs(base.controller, current.controller) })
    }
    if (inputOnly) {
      continue
    }
    const count = identity.kind === 'build' ? 1 : 8
    for (let index = 1; index <= count; index++) {
      const [baseInputs, currentInputs] = await Promise.all([base, current].map(session => fs.readFile(path.join(session.folder, `inputs-${index}.json`), 'utf8').then(JSON.parse)))
      const result = compareInputSnapshots(baseInputs, currentInputs)
      comparisons.push({ kind: identity.kind, run: identity.run, index, phase: baseInputs.phase, ...result })
    }
  }
  const inputOnly = sessions.some(session => session.controller.identity.project === weappViteInputProject && session.controller.identity.mode === 'inputs')
  if (!inputOnly && comparisons.length !== 11) {
    throw new Error('诊断缺失固定 3 build / 3 mutation / 3 rollback / start / stop 的阶段')
  }
  if (inputOnly && operationComparisons.length === 0) {
    throw new Error('weapp-vite input-only 缺少可比较的操作输入证据')
  }
  return {
    diagnosticOnly: true,
    canExplainFormalRegression: false,
    explanation: inputOnly
      ? (operationComparisons.every(item => item.sameRecordedOperationsAndInputs)
          ? '已核对 weapp-vite input-only 的实际调用输入和完成边界；诊断仍只提供归因线索，不能替代正式预算或独立建立因果'
          : '两侧 weapp-vite input-only 的实际调用输入不同，或存在无法跨进程比较的身份；不能用本轮差异解释正式失败，先核对列出的证据')
      : (comparisons.every(item => item.sameActualCandidatesAndSourceHashes) && operationComparisons.every(item => item.sameRecordedOperationsAndInputs)
          ? '已核对候选和来源；插桩分配仍只提供归因线索，不能替代正式预算或独立建立因果'
          : '两侧实际候选、源码或调用输入不同，或存在无法跨进程比较的身份；不能用本轮分配差异解释正式失败，先核对列出的证据'),
    inputOnly,
    comparisons,
    operationComparisons,
  }
}
