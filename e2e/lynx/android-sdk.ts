import type { NativeEvidenceContext, NativePlatformReport, ResolvedAndroidSdk } from '../../examples/react-lynx/src/compatibility/types'
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { ANDROID_SDK_REFERENCE, validateAndroidSdkArtifact, validateResolvedAndroidSdk } from '../../examples/react-lynx/src/compatibility/android-sdk-contract'
import { readZipEntry } from './zip-entry'

export const ANDROID_SDK_FILES = { aar: 'resolved.aar', build: 'build.apk', installed: 'installed.apk', resolved: 'resolved.json', receipt: 'installation.json' } as const
export const LYNX_ANDROID_APPLICATION_ID = 'com.weapptailwindcss.lynxcompat'
export const androidSdkHash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')

export function androidSdkDirectory(artifactDir: string) {
  return path.join(artifactDir, 'android-sdk')
}

function requireSame(actual: unknown, expected: unknown, field: string) {
  if (!isDeepStrictEqual(actual, expected)) {
    throw new Error(`Lynx Android SDK ${field} 与本轮原始证据不符`)
  }
}

/** AAR 先校验整文件官方指纹，再读取 ABI 原始库；不采信声明版本或报告中的布尔结论。 */
export function validateAndroidBuildFiles(aar: Buffer, apk: Buffer, resolved: ResolvedAndroidSdk, context: NativeEvidenceContext) {
  validateResolvedAndroidSdk(resolved, context)
  requireSame(androidSdkHash(aar), ANDROID_SDK_REFERENCE.aarSha256, 'AAR SHA-256')
  for (const [abi, hash] of Object.entries(ANDROID_SDK_REFERENCE.libraries)) {
    requireSame(androidSdkHash(readZipEntry(aar, `jni/${abi}/liblynx.so`)), hash, `${abi} AAR liblynx.so`)
    requireSame(androidSdkHash(readZipEntry(apk, `lib/${abi}/liblynx.so`)), hash, `${abi} APK liblynx.so`)
  }
  requireSame(JSON.parse(readZipEntry(apk, 'assets/lynx-sdk-identity.json', 64 * 1024).toString('utf8')), resolved, 'APK resolved asset')
  requireSame(JSON.parse(readZipEntry(apk, 'assets/run-context.json', 64 * 1024).toString('utf8')), context, 'APK run context')
  requireSame(androidSdkHash(readZipEntry(apk, 'assets/main.lynx.bundle')), context.bundleSha256, 'APK bundle')
}

/** Android 最终验收始终强制此层，不能通过填入 iOS 的 SDK 自报值跳过。 */
export async function validateAndroidSdkEvidence(report: NativePlatformReport, artifactDir: string, context: NativeEvidenceContext) {
  const mediaGate = report.mediaGate
  validateAndroidSdkArtifact(mediaGate?.sdkArtifact, context, mediaGate?.sdkVersion ?? '')
  const artifact = mediaGate!.sdkArtifact!
  requireSame(artifact.abi, report.environment.abi, 'native/adb ABI')
  const directory = androidSdkDirectory(artifactDir)
  const [aar, build, installed, resolvedSource, receiptSource, deviceSource] = await Promise.all([
    fs.readFile(path.join(directory, ANDROID_SDK_FILES.aar)),
    fs.readFile(path.join(directory, ANDROID_SDK_FILES.build)),
    fs.readFile(path.join(directory, ANDROID_SDK_FILES.installed)),
    fs.readFile(path.join(directory, ANDROID_SDK_FILES.resolved), 'utf8'),
    fs.readFile(path.join(directory, ANDROID_SDK_FILES.receipt), 'utf8'),
    fs.readFile(path.join(artifactDir, 'device.json'), 'utf8'),
  ])
  const resolved = JSON.parse(resolvedSource) as ResolvedAndroidSdk
  requireSame(artifact.resolved, resolved, 'native/resolved manifest')
  validateAndroidBuildFiles(aar, build, resolved, context)
  const apkHash = androidSdkHash(build)
  requireSame(androidSdkHash(installed), apkHash, 'build/installed APK')
  requireSame(artifact.apkSha256, apkHash, 'native/build APK')
  requireSame(artifact.librarySha256, androidSdkHash(readZipEntry(installed, `lib/${artifact.abi}/liblynx.so`)), 'native/installed liblynx.so')
  const receipt = JSON.parse(receiptSource)
  const device = JSON.parse(deviceSource)
  if (receipt.version !== 1 || receipt.source !== 'lynx-adb-installed-apk-v1' || device.platform !== 'android'
    || !device.id || receipt.deviceId !== device.id || receipt.applicationId !== LYNX_ANDROID_APPLICATION_ID
    || typeof receipt.installedPath !== 'string' || !/^\/[^\r\n]+\.apk$/.test(receipt.installedPath)) {
    throw new Error('Lynx Android SDK 安装回执缺失精确设备或 APK 来源')
  }
  for (const [key, value] of Object.entries({ runId: context.runId, bundleSha256: context.bundleSha256, abi: artifact.abi, buildApkSha256: apkHash, installedApkSha256: apkHash, resolvedSha256: androidSdkHash(Buffer.from(resolvedSource)) })) {
    requireSame(receipt[key], value, `installation ${key}`)
  }
  const sidecarName = 'media-hover-v1.native.json'
  const receipts = report.evidence?.artifacts.filter(item => item.name === sidecarName)
  if (receipts?.length !== 1 || receipts[0]!.runId !== context.runId) {
    throw new Error('Lynx Android SDK 缺少本轮原生侧车回执')
  }
  const bytes = await fs.readFile(path.join(artifactDir, 'crops', context.runId, sidecarName))
  requireSame({ sha256: androidSdkHash(bytes), byteLength: bytes.length }, { sha256: receipts[0]!.sha256, byteLength: receipts[0]!.byteLength }, 'native sidecar receipt')
  const sidecar = JSON.parse(bytes.toString('utf8'))
  requireSame(sidecar.context, context, 'native sidecar context')
  if (sidecar.version !== 1 || sidecar.source !== 'lynx-native-media-gate-v1') {
    throw new Error('Lynx Android SDK 需要原生侧车来源')
  }
  requireSame(sidecar.mediaGate.sdkVersion, mediaGate!.sdkVersion, 'reported SDK version')
  requireSame(sidecar.mediaGate.sdkArtifact, artifact, 'native sidecar artifact')
}
