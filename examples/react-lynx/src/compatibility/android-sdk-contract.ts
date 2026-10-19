import type { NativeAndroidSdkArtifact, NativeEvidenceContext, NativeMediaGateEvidence, Platform, ResolvedAndroidSdk } from './types'
import reference from './android-sdk-reference.json'

export const ANDROID_SDK_REFERENCE = reference

/** release 身份来自解析后的 AAR；SDK getter 的原始值独立保留。 */
export function validateResolvedAndroidSdk(value: ResolvedAndroidSdk | undefined, context: NativeEvidenceContext) {
  if (!value || value.version !== 1 || value.source !== 'lynx-gradle-resolved-sdk-v1'
    || value.runId !== context.runId || value.bundleSha256 !== context.bundleSha256
    || value.component !== reference.component || value.artifactVersion !== reference.artifactVersion || value.aarSha256 !== reference.aarSha256
    || !value.libraries || Object.keys(value.libraries).length !== Object.keys(reference.libraries).length
    || !Object.entries(reference.libraries).every(([abi, hash]) => value.libraries[abi] === hash)) {
    throw new Error('Lynx Android SDK resolved artifact 与本轮身份或官方 AAR 指纹不符')
  }
}

/** 此处仅检查桥接数据；离线验收仍需重读实际 AAR、APK 和侧车。 */
export function validateAndroidSdkArtifact(value: NativeAndroidSdkArtifact | undefined, context: NativeEvidenceContext, reportedVersion: string) {
  if (!value || reportedVersion !== reference.reportedVersion || !/^[a-f0-9]{64}$/.test(value.apkSha256)
    || !Object.hasOwn(reference.libraries, value.abi) || value.librarySha256 !== reference.libraries[value.abi as keyof typeof reference.libraries]) {
    throw new Error('Lynx Android SDK artifact 缺失或原始自报值、APK、ABI 身份无效')
  }
  validateResolvedAndroidSdk(value.resolved, context)
}

/** 最终验收绑定实际平台，iOS 不能借用 Android 的 release 身份解释 raw getter。 */
export function validatePlatformSdk(evidence: NativeMediaGateEvidence | undefined, platform: Platform, context: NativeEvidenceContext) {
  if (platform === 'android') {
    validateAndroidSdkArtifact(evidence?.sdkArtifact, context, evidence?.sdkVersion ?? '')
  }
  else if (evidence && (evidence.sdkArtifact !== undefined || evidence.sdkVersion !== '4.0.1')) {
    throw new Error('Lynx iOS SDK 必须提供原始 4.0.1 自报值，不能夹带 Android artifact')
  }
}
