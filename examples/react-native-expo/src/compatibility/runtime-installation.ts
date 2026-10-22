import type { NativeRuntimeIdentity, NativeRuntimeInstallation, NativeSemanticContext } from './protocol'
import { getManifest, getPublication } from '@weapp-tailwindcss/react-native/runtime'
import { nativeReportHeaders } from './report-client'

const instanceKey = '__WEAPP_TAILWIND_E2E_RUNTIME_INSTANCE__'

/** 实例身份来自设备 JS realm，模块热更新复用；整包重新加载会创建新 realm。它不是认证凭据。 */
export function runtimeInstanceForRealm(realm: object = globalThis): string {
  const existing = Object.getOwnPropertyDescriptor(realm, instanceKey)
  if (existing) {
    if (existing.configurable || existing.writable || typeof existing.value !== 'string' || !/^[\w-]{16,128}$/.test(existing.value)) {
      throw new Error('React Native 运行实例身份被其它代码占用或修改')
    }
    return existing.value
  }
  const randomPart = () => Math.random().toString(36).slice(2).padEnd(12, '0')
  const identity = `${Date.now().toString(36)}-${randomPart()}-${randomPart()}`
  Object.defineProperty(realm, instanceKey, { value: identity, configurable: false, writable: false, enumerable: false })
  return identity
}

export function runtimeInstallationIdentity(value: NativeRuntimeIdentity): NativeRuntimeIdentity {
  return { version: value.version, runtimeInstanceId: value.runtimeInstanceId, publication: { ...value.publication } }
}

/** 同步读取实际 runtime 已安装的快照，不从 context、源码或宿主摘要构造回显。 */
export function captureRuntimeInstallation(): NativeRuntimeInstallation {
  const before = getPublication()
  const manifest = getManifest()
  const after = getPublication()
  if (!before || !after || !manifest || before.revision !== after.revision || before.manifestSha256 !== after.manifestSha256) {
    throw new Error('React Native 实际安装 manifest 缺少稳定发布身份')
  }
  return { version: 1, runtimeInstanceId: runtimeInstanceForRealm(), publication: { ...after }, manifestJson: JSON.stringify(manifest) }
}

export function assertCurrentRuntimeInstallation(expected: NativeRuntimeInstallation) {
  const actual = captureRuntimeInstallation()
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`React Native 采集期间实际安装或运行实例发生变化：${JSON.stringify({ actual: runtimeInstallationIdentity(actual), expected: runtimeInstallationIdentity(expected), manifestChanged: actual.manifestJson !== expected.manifestJson })}`)
  }
}

function waitForPublication(signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const finish = () => {
      signal.removeEventListener('abort', abort)
      resolve()
    }
    const timer = setTimeout(finish, 100)
    const abort = () => {
      clearTimeout(timer)
      signal.removeEventListener('abort', abort)
      reject(signal.reason)
    }
    signal.addEventListener('abort', abort, { once: true })
    if (signal.aborted) {
      abort()
    }
  })
}

/** 原生 AbortSignal 的实现不一定提供 throwIfAborted。 */
export function assertRuntimePhaseActive(signal: AbortSignal) {
  if (signal.aborted) {
    throw signal.reason ?? new Error('React Native 所属阶段或案例已结束')
  }
}

/** 宿主只选择本阶段的 publication；安装内容必须独立读取实际 runtime，开始后不再替换。 */
export async function acquireRuntimePhase(reportUrl: string, revision: string, signal: AbortSignal, installed?: NativeRuntimeInstallation, observeContext?: (context: NativeSemanticContext) => void) {
  const instance = installed?.runtimeInstanceId ?? runtimeInstanceForRealm()
  const deadline = Date.now() + 120_000
  while (Date.now() < deadline) {
    assertRuntimePhaseActive(signal)
    if (installed) {
      assertCurrentRuntimeInstallation(installed)
    }
    const response = await fetch(`${reportUrl}/context`, { headers: nativeReportHeaders(), signal })
    assertRuntimePhaseActive(signal)
    if (response.status === 425 && !installed) {
      await waitForPublication(signal)
      continue
    }
    if (!response.ok) {
      throw new Error(`Native context HTTP ${response.status}`)
    }
    const context = await response.json() as NativeSemanticContext
    assertRuntimePhaseActive(signal)
    if (context.revision !== revision || !context.publication?.revision || typeof context.publication.manifestSha256 !== 'string') {
      throw new Error('React Native 阶段 context 缺少本轮 publication fence')
    }
    observeContext?.(context)
    const actual = captureRuntimeInstallation()
    if (actual.runtimeInstanceId !== instance) {
      throw new Error('React Native 等待阶段发布时运行实例发生变化')
    }
    if (installed) {
      assertCurrentRuntimeInstallation(installed)
    }
    if (actual.publication.revision === context.publication.revision && actual.publication.manifestSha256 === context.publication.manifestSha256) {
      return { context, installation: installed ?? actual }
    }
    if (installed) {
      throw new Error('React Native 已开始采集的安装与宿主阶段 publication fence 不符')
    }
    await waitForPublication(signal)
  }
  throw new Error('React Native 等待本阶段实际安装超时')
}
