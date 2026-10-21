import type { NativeRuntimeIdentity, NativeRuntimeInstallation } from '../../examples/react-native-expo/src/compatibility/protocol'
import { createHash } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import { getManifestPathsForProjectRoot } from '../../packages/react-native/src/metro'
import { readPublishedSnapshot } from '../../packages/react-native/src/metro/manifest-store'

/** 从真实发布文件选取阶段 fence；设备内容仍须另行校验，不能由此替代。 */
export async function readRuntimePublication(projectRoot: string) {
  const { manifestPath, manifestReadyPath } = getManifestPathsForProjectRoot(projectRoot)
  const snapshot = await readPublishedSnapshot(manifestPath, manifestReadyPath)
  if (!snapshot?.publication) {
    throw new Error('React Native 宿主缺少稳定发布身份')
  }
  return snapshot.publication
}

export function validateRuntimeIdentity(value: unknown): asserts value is NativeRuntimeIdentity {
  const identity = value as NativeRuntimeIdentity | undefined
  if (identity?.version !== 1 || typeof identity.runtimeInstanceId !== 'string' || !/^[\w-]{16,128}$/.test(identity.runtimeInstanceId)
    || typeof identity.publication?.revision !== 'string' || !identity.publication.revision.trim()
    || typeof identity.publication.manifestSha256 !== 'string' || !/^[a-f\d]{64}$/.test(identity.publication.manifestSha256)) {
    throw new Error('React Native 缺少有效实际安装或运行实例身份')
  }
}

export function runtimeIdentity(value: NativeRuntimeIdentity): NativeRuntimeIdentity {
  validateRuntimeIdentity(value)
  return { version: value.version, runtimeInstanceId: value.runtimeInstanceId, publication: { ...value.publication } }
}

export function assertRuntimeIdentity(actual: unknown, expected: NativeRuntimeIdentity) {
  validateRuntimeIdentity(actual)
  if (!isDeepStrictEqual(runtimeIdentity(actual), runtimeIdentity(expected))) {
    throw new Error('React Native 实际安装或运行实例身份不一致')
  }
}

export function validateRuntimeInstallation(value: unknown): asserts value is NativeRuntimeInstallation {
  validateRuntimeIdentity(value)
  const installation = value as NativeRuntimeInstallation
  if (typeof installation.manifestJson !== 'string' || !installation.manifestJson.length) {
    throw new Error('React Native 缺少设备实际安装的 manifest 快照')
  }
  let manifest: unknown
  try {
    manifest = JSON.parse(installation.manifestJson)
  }
  catch { throw new Error('React Native 实际安装 manifest 不是有效 JSON') }
  if (!manifest || typeof manifest !== 'object' || !('rules' in manifest) || !manifest.rules || typeof manifest.rules !== 'object' || Array.isArray(manifest.rules)) {
    throw new Error('React Native 实际安装 manifest 缺少规则对象')
  }
}

/** 宿主字节摘要与设备实际内容分别核对，格式化差异不能冒充语义差异或来源证据。 */
export function validateInstalledManifest(installation: NativeRuntimeInstallation | undefined, manifestSource: string, publication: { revision: string, manifestSha256: string }) {
  validateRuntimeInstallation(installation)
  const hostDigest = createHash('sha256').update(manifestSource).digest('hex')
  if (hostDigest !== publication.manifestSha256 || !isDeepStrictEqual(installation.publication, { revision: publication.revision, manifestSha256: publication.manifestSha256 })
    || !isDeepStrictEqual(JSON.parse(installation.manifestJson), JSON.parse(manifestSource))) {
    throw new Error('React Native 设备实际安装与本阶段归档 manifest 或发布身份不符')
  }
}
