import type { NativeRuntimeIdentity, NativeRuntimeInstallation } from './protocol'
import { getManifest, getPublication } from '@weapp-tailwindcss/react-native/runtime'

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
    throw new Error('React Native 采集期间实际安装或运行实例发生变化')
  }
}
