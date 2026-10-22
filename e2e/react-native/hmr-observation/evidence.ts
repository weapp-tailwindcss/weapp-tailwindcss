import type { HmrObservationSnapshot } from '../../../examples/react-native-expo/src/compatibility/hmr-observation.cjs'
import type { NativeRuntimeInstallation, ReactNativeReport } from '../../../examples/react-native-expo/src/compatibility/protocol'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { assertRuntimeIdentity, validateRuntimeInstallation } from '../installation-evidence'
import { nativePhaseForRevision, nativeRuntimePhases } from '../phase-contract'
import { hmrObserverSourceIdentity } from './identity'

const hash = (value: Uint8Array | string) => createHash('sha256').update(value).digest('hex')

/** 保留完整原始字符串；重放时重新解析，不把宿主响应或解析摘要当接收证据。 */
export function validateHmrSnapshot(snapshot: HmrObservationSnapshot, expected: HmrObservationSnapshot['identity']) {
  if (snapshot?.schemaVersion !== 1 || !isDeepStrictEqual(snapshot.identity, expected)
    || snapshot.boundary !== 'original-metro-client-websocket' || snapshot.initialBundle !== 'not-captured' || snapshot.evaluator !== 'not-captured'
    || snapshot.failed || !Array.isArray(snapshot.errors) || snapshot.errors.length || !Array.isArray(snapshot.connections) || !snapshot.connections.length
    || !Array.isArray(snapshot.records) || snapshot.records.length > 4096) {
    throw new Error('HMR 接收观察缺少本轮完整原件或身份')
  }
  for (const [position, connection] of snapshot.connections.entries()) {
    if (connection.id !== position + 1 || !['http:', 'https:', 'ws:', 'wss:'].includes(new URL(connection.url).protocol)) {
      throw new Error('HMR 连接身份或协议无效')
    }
  }
  let characters = 0
  return snapshot.records.map((record, position) => {
    if (record.sequence !== position + 1 || !snapshot.connections.some(connection => connection.id === record.connectionId)
      || !['message-received', 'send-returned'].includes(record.kind) || !Number.isFinite(record.receivedAtMs)
      || typeof record.data !== 'string') {
      throw new Error('HMR 原始消息缺失、序号断裂或预算超限')
    }
    characters += record.data.length
    if (characters > 32 * 1024 * 1024) {
      throw new Error('HMR 原始消息预算超限')
    }
    const message = JSON.parse(record.data)
    if (!message || typeof message !== 'object' || typeof message.type !== 'string') {
      throw new Error('HMR 原始消息不是协议对象')
    }
    if (record.kind === 'message-received' && message.type === 'update') {
      const body = message.body
      const moduleId = (value: unknown) => typeof value === 'string' || (typeof value === 'number' && Number.isSafeInteger(value))
      if (!body || typeof body.revisionId !== 'string' || !body.revisionId || typeof body.isInitialUpdate !== 'boolean'
        || !['added', 'modified', 'deleted'].every(name => Array.isArray(body[name])) || !body.deleted.every(moduleId)) {
        throw new Error('HMR update 缺少 revision、initial 标记或模块集合')
      }
      for (const item of [...body.added, ...body.modified]) {
        if (!Array.isArray(item?.module) || item.module.length !== 2 || !moduleId(item.module[0]) || typeof item.module[1] !== 'string'
          || typeof item.sourceURL !== 'string' || typeof item.sourceMappingURL !== 'string') {
          throw new Error('HMR 模块丢失代码、带类型 ID 或来源 URL')
        }
      }
    }
    return { ...record, dataSha256: hash(record.data), message }
  })
}

/** 该边界只表明完成报告前收到消息并观察到稳定安装，不声明代码执行或阶段因果链。 */
export async function archiveHmrSnapshot(directory: string, report: ReactNativeReport, snapshot: HmrObservationSnapshot) {
  const session = JSON.parse(await readFile(path.join(directory, 'runtime-session.json'), 'utf8'))
  validateHmrSnapshot(snapshot, { runId: session.runId, invocationId: session.invocationId })
  validateRuntimeInstallation(report.runtimeInstallation)
  if (report.platform === 'web' || report.runId !== session.runId) {
    throw new Error('HMR 原生观察平台或报告身份不符')
  }
  const phase = nativePhaseForRevision(report.revision)
  const root = path.join(directory, 'hmr-client')
  await mkdir(root, { recursive: true })
  const record = { schemaVersion: 1, evidence: 'completion-time-message-and-installation-observation', phase: phase.id, revision: phase.revision, snapshot, installation: report.runtimeInstallation }
  await writeFile(path.join(root, `${phase.id}.json`), `${JSON.stringify(record, null, 2)}\n`, { flag: 'wx' })
}

/** 对实际 resolver 原件和累计消息逐阶段对账；未补齐模块因果链的声明保持 not-captured。 */
export async function validateNativeHmrObservations(directory: string, platform: 'android' | 'ios') {
  const session = JSON.parse(await readFile(path.join(directory, 'runtime-session.json'), 'utf8'))
  const root = path.join(directory, 'hmr-client')
  const receipt = JSON.parse(await readFile(path.join(root, `${platform}-resolver.json`), 'utf8'))
  const binding = JSON.parse(await readFile(path.join(root, 'identity.json'), 'utf8'))
  const client = await readFile(path.join(root, `${platform}-client-source.js`))
  const packageSource = await readFile(path.join(root, `${platform}-client-package.json`))
  if (receipt.schemaVersion !== 1 || receipt.evidence !== 'resolver-result' || receipt.platform !== platform
    || receipt.identity?.runId !== session.runId || receipt.identity?.invocationId !== session.invocationId
    || receipt.clientSourceSha256 !== hash(client) || receipt.clientPackage?.packageJsonSha256 !== hash(packageSource)
    || receipt.clientPackage.name !== 'metro-runtime' || JSON.parse(packageSource.toString()).name !== 'metro-runtime'
    || JSON.parse(packageSource.toString()).version !== receipt.clientPackage.version || receipt.request !== 'metro-runtime/src/modules/HMRClient'
    || !isDeepStrictEqual(binding.identity, { runId: session.runId, invocationId: session.invocationId })
    || !isDeepStrictEqual(Object.keys(binding).sort(), ['identity', 'pathFlavor', 'projectRoot', 'serverRoot', 'utilitiesPath', 'wrapperPath'])
    || !['posix', 'win32'].includes(receipt.pathFlavor) || !isDeepStrictEqual(Object.fromEntries(Object.keys(binding).map(key => [key, receipt[key]])), binding)) {
    throw new Error('HMR resolver 或客户端源码包原件不符')
  }
  const paths = receipt.pathFlavor === 'win32' ? path.win32 : path.posix
  if (![receipt.originModulePath, receipt.resolvedPath, receipt.wrapperPath, receipt.projectRoot, receipt.serverRoot, receipt.utilitiesPath].every(value => typeof value === 'string' && paths.isAbsolute(value))
    || paths.resolve(receipt.originModulePath) !== paths.resolve(receipt.utilitiesPath)) {
    throw new Error('HMR resolver 文件系统来源不符')
  }
  const names = ['observer-wrapper.cjs', 'observer-recorder.cjs', 'observer-resolver.cjs', 'observer-metro-config.js']
  if (!isDeepStrictEqual(receipt.observers, hmrObserverSourceIdentity)) {
    throw new Error('HMR 观察器缺少原始源码')
  }
  for (const [position, name] of names.entries()) {
    const bytes = await readFile(path.join(root, name))
    const entry = receipt.observers[position]
    if (entry?.name !== name || entry.sha256 !== hash(bytes) || entry.byteLength !== bytes.length || (position === 0 && receipt.wrapperSha256 !== entry.sha256)) {
      throw new Error('HMR 观察器原始源码摘要不符')
    }
  }
  let previous: HmrObservationSnapshot | undefined
  let installation: NativeRuntimeInstallation | undefined
  const summaries = []
  for (const phase of nativeRuntimePhases) {
    const record = JSON.parse(await readFile(path.join(root, `${phase.id}.json`), 'utf8'))
    const report = JSON.parse(await readFile(path.join(directory, 'phases', phase.id, 'report.json'), 'utf8')) as ReactNativeReport
    if (record.schemaVersion !== 1 || record.evidence !== 'completion-time-message-and-installation-observation' || record.phase !== phase.id || record.revision !== phase.revision
      || report.platform !== platform || report.runId !== session.runId || !isDeepStrictEqual(record.installation, report.runtimeInstallation)) {
      throw new Error('HMR 完成时观察与本阶段实际报告不符')
    }
    validateRuntimeInstallation(record.installation)
    const snapshot = record.snapshot as HmrObservationSnapshot
    const messages = validateHmrSnapshot(snapshot, { runId: session.runId, invocationId: session.invocationId })
    if (!messages.some(message => message.kind === 'message-received')) {
      throw new Error('HMR 观察没有收到原连接消息')
    }
    if (previous && (!isDeepStrictEqual(snapshot.connections, previous.connections) || !isDeepStrictEqual(snapshot.records.slice(0, previous.records.length), previous.records)
      || record.installation.runtimeInstanceId !== installation!.runtimeInstanceId)) {
      throw new Error('HMR 累计消息或运行实例在阶段之间被替换')
    }
    if (previous && !messages.slice(previous.records.length).some(message => message.kind === 'message-received' && message.message.type === 'update' && message.message.body.isInitialUpdate === false)) {
      throw new Error('HMR 后续阶段缺少新增非 initial update 原件')
    }
    const archived = await readFile(path.join(directory, 'phases', phase.id, 'hmr-observation.json'), 'utf8')
    if (!isDeepStrictEqual(JSON.parse(archived), record)) {
      throw new Error('HMR 阶段归档与原始观察不符')
    }
    assertRuntimeIdentity(record.installation, report.runtimeInstallation!)
    summaries.push({ phase: phase.id, messages: messages.filter(message => message.kind === 'message-received').length, installationObserved: true })
    previous = snapshot
    installation = record.installation
  }
  const files = ['identity.json', `${platform}-resolver.json`, `${platform}-client-source.js`, `${platform}-client-package.json`, ...names, ...nativeRuntimePhases.map(phase => `${phase.id}.json`)].map(name => path.join(root, name))
  return { evidence: 'completion-time-message-and-installation-observation', phases: summaries, initialBundle: 'not-captured', evaluator: 'not-captured', modulePhaseCausality: 'not-captured', files }
}

export async function prepareMetroHmrObservation(repoRoot: string, directory: string, identity: HmrObservationSnapshot['identity']) {
  const example = path.join(repoRoot, 'examples', 'react-native-expo')
  const require = createRequire(path.join(example, 'package.json'))
  const utilitiesPath = require.resolve('react-native/Libraries/Utilities/HMRClient')
  const wrapperPath = path.join(example, 'src', 'compatibility', 'hmr-observer-wrapper.cjs')
  return {
    RN_METRO_HMR_ARCHIVE: JSON.stringify({ directory: path.join(directory, 'hmr-client'), identity, utilitiesPath, wrapperPath, metroConfigPath: path.join(example, 'metro.config.js') }),
    EXPO_PUBLIC_RN_HMR_RUN_ID: identity.runId,
    EXPO_PUBLIC_RN_HMR_INVOCATION_ID: identity.invocationId,
  }
}
