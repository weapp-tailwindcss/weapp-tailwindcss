import { Buffer } from 'node:buffer'
import fs from 'node:fs/promises'
import path from 'node:path'
import { sha256 } from './evidence.mjs'

/** 与既有全文 receipt 校验配合，复核 Uni 原始字节、处理器文本与 bundle 归属。 */
export async function verifyUniInputEvidence(directory, summary, events) {
  if (!summary || summary.recordingError || !Array.isArray(summary.bundles) || !summary.bundles.length) throw new Error('Uni 输入诊断状态缺失或失败')
  const records = events.filter(event => event.name.startsWith('uni.'))
  const ids = new Set(summary.bundles.map(item => item.id))
  if (ids.size !== summary.bundles.length || records.some(event => !ids.has(event.details?.bundleId))) throw new Error('Uni bundle 身份重复或事件归属未知')
  const texts = new Map()
  async function text(reference) {
    if (!reference?.text?.file || !/^text-[a-f\d]{64}\.json$/.test(reference.text.file)) throw new Error('Uni 输入缺少完整原文引用')
    const file = reference.text.file
    if (!texts.has(file)) {
      const stored = JSON.parse(await fs.readFile(path.join(directory, file), 'utf8'))
      if (typeof stored.text !== 'string') throw new Error('Uni 输入全文不是字符串')
      texts.set(file, stored.text)
    }
    const value = texts.get(file)
    if (sha256(value) !== reference.text.sha256) throw new Error('Uni 输入全文 SHA 不匹配')
    return value
  }
  const finalizations = new Set()
  const cacheStates = new Map()
  const phaseCosts = []
  for (const bundle of summary.bundles) {
    if (!Number.isSafeInteger(bundle.id) || bundle.id < 1 || !bundle.closed) throw new Error('Uni bundle 未完整关闭')
    const own = records.filter(event => event.details.bundleId === bundle.id)
    if (!bundle.phase || bundle.phase.type === 'unknown' || own.some(event => event.phase.type !== bundle.phase.type || event.phase.round !== bundle.phase.round)) throw new Error('Uni bundle 开始阶段缺失或发生动态错配')
    const exactly = (name) => {
      const selected = own.filter(event => event.name === `uni.${name}`)
      if (selected.length !== 1) throw new Error(`Uni bundle 缺少唯一证据：${bundle.id}/${name}`)
      return selected[0]
    }
    const raw = exactly('bundle.input')
    const snapshot = exactly('snapshot')
    const plan = exactly('plan.complete')
    const completion = exactly('finalization')
    const begin = exactly('bundle.start')
    const end = exactly('bundle.success')
    if (own.some(event => event.sequence < begin.sequence || event.sequence > end.sequence)) throw new Error('Uni 事件越过所属 bundle 的实际生命周期')
    if (!bundle.raw || !bundle.snapshot || !bundle.completed || !Number.isSafeInteger(bundle.finalizationId) || bundle.finalizationId !== completion.details.finalizationId || finalizations.has(bundle.finalizationId)) throw new Error('Uni finalization 绑定不完整或重复')
    finalizations.add(bundle.finalizationId)
    const vite = events.filter(event => event.name === 'vite.completed' && event.details.finalizationId === bundle.finalizationId)
    if (vite.length !== 1) throw new Error('Uni finalization 没有唯一实际 Vite 完成事件')
    if (!(raw.sequence < snapshot.sequence && snapshot.sequence < plan.sequence && plan.sequence < completion.sequence && completion.sequence < vite[0].sequence)) throw new Error('Uni 原始输入、规划与完成事件顺序损坏')
    if (!Array.isArray(raw.details.entries) || !Array.isArray(snapshot.details.entries)) throw new Error('Uni bundle 输入条目缺失')
    for (const entry of raw.details.entries) {
      const value = await text(entry.content)
      if (!['utf8-string', 'base64'].includes(entry.encoding)) throw new Error('Uni 原始输入编码未知')
      const bytes = Buffer.from(value, entry.encoding === 'base64' ? 'base64' : 'utf8')
      if ((entry.encoding === 'base64' && bytes.toString('base64') !== value) || bytes.length !== entry.rawBytes || sha256(bytes) !== entry.rawByteSha256) throw new Error('Uni 原始 bundle 字节 SHA 不匹配')
    }
    for (const entry of snapshot.details.entries) {
      const value = await text(entry.source)
      if (sha256(value) !== entry.sourceSha256 || Buffer.byteLength(value) !== entry.utf8Bytes || value.length !== entry.utf16Length) throw new Error('Uni 实际处理器输入 SHA 或长度不匹配')
    }
    for (const name of ['processFiles', 'changedByType', 'runtimeAffectingChangedByType', 'linkedImpactsByEntry', 'removedFiles']) {
      if (snapshot.details.selection?.[name] === undefined) throw new Error(`Uni 缺少资产选择证据：${name}`)
    }
    for (const name of ['entries.plan', 'tasks']) {
      if (!Number.isFinite(plan.details.timingDetails?.[name]) || plan.details.timingDetails[name] < 0) throw new Error(`Uni 缺少原阶段成本：${name}`)
    }
    const layers = own.filter(event => event.name === 'uni.layer')
    const called = (name, file) => own.some(event => event.name === `uni.phase.${name}.start` && event.details.file === file)
    const hasLayer = (layer, file) => layers.some(event => event.details.layer === layer && event.details.file === file)
    for (const [call, layer] of [['runtime.processViteCssBundleEntry', 'css-plan'], ['runtime.processJsBundleEntry', 'js'], ['runtime.processHtmlBundleEntry', 'html'], ['css-plan.processViteCssEntryTransform', 'css-decision'], ['css-decision.scheduleViteCssTransform', 'css-schedule'], ['js.createFrameworkJsAssetContext', 'js-asset']]) {
      for (const event of own.filter(item => item.name === `uni.phase.${call}.start`)) {
        if (!hasLayer(layer, event.details.file)) throw new Error(`Uni 实际进入的处理层缺证：${layer}/${event.details.file}`)
      }
    }
    for (const event of layers) {
      const { layer, file } = event.details
      const cache = own.filter(item => item.name === 'uni.cache' && item.details.file === file && item.details.sourceModule === event.details.sourceModule)
      if (layer === 'css-plan' && !called('css-plan.normalizeRelativeCssConfigDirectives', file)) throw new Error('Uni CSS plan 子阶段成本缺证')
      if (layer === 'css-decision' && !cache.some(item => item.details.state === 'cancelled') && !called('css-decision.resolveViteCssTransformDecisionPlan', file)) throw new Error('Uni CSS decision 子阶段成本缺证')
      if (layer === 'js' && snapshot.details.entries.some(item => item.file === file && item.outputType === 'chunk') && !called('js.createJsHashSalt', file)) throw new Error('Uni JS plan 子阶段成本缺证')
      if (['html', 'css-schedule'].includes(layer) && !cache.length) throw new Error(`Uni 实际 cache 分支缺证：${layer}/${file}`)
    }
    const dependency = exactly('dependencies').details
    if (!Array.isArray(dependency.loaded) || !Array.isArray(dependency.resolved) || !Array.isArray(dependency.missingEvidence)) throw new Error('Uni physical 模块身份缺少已加载、解析或缺证分类')
    if (dependency.loaded.some(item => item.evidence !== 'loaded-cjs-cache') || dependency.resolved.some(item => item.evidence !== 'resolved-only' || !['unknown', 'proven-cjs-cache'].includes(item.loaded))) throw new Error('Uni physical 身份混淆 resolve 与 loaded')
  }
  for (const event of records) {
    if (event.name === 'uni.cache') cacheStates.set(event.details.state, (cacheStates.get(event.details.state) ?? 0) + 1)
    if (event.name.startsWith('uni.phase.') && event.name.endsWith('.success')) phaseCosts.push({ name: event.name, bundleId: event.details.bundleId, durationMs: event.durationMs, operationId: event.details.operationId })
  }
  return { bundles: summary.bundles.length, finalizations: [...finalizations], cacheStates: Object.fromEntries(cacheStates), phaseCosts, missingEvidence: records.filter(event => event.name === 'uni.dependencies').flatMap(event => event.details.missingEvidence.map(item => ({ bundleId: event.details.bundleId, ...item }))), interpretation: 'raw bundle 在本 hook 入口归档；snapshot 是处理器实际消费的字符串。阶段是墙钟且允许并发重叠；不把 process/shared/last-result/processed-reuse 合并为同一种命中。' }
}
