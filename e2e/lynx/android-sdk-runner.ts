import type { NativeEvidenceContext, ResolvedAndroidSdk } from '../../examples/react-lynx/src/compatibility/types'
import type { AndroidDevice } from './native-device'
import fs from 'node:fs/promises'
import path from 'node:path'
import { ANDROID_SDK_FILES, androidSdkDirectory, androidSdkHash, LYNX_ANDROID_APPLICATION_ID, validateAndroidBuildFiles } from './android-sdk'
import { command } from './native-command'
import { adbArgs } from './native-device'

/** Gradle 正式产物按本轮独占保存；禁止从依赖声明推导实际 SDK。 */
export async function saveAndroidSdkBuild(hostDir: string, artifactDir: string, apkPath: string, context: NativeEvidenceContext) {
  const directory = androidSdkDirectory(artifactDir)
  await fs.mkdir(directory)
  const aar = path.join(hostDir, 'app', 'build', 'lynxSdkEvidence', 'debug', 'resolved.aar')
  const resolved = path.join(hostDir, 'app', 'build', 'lynxSdkEvidence', 'debug', 'resolved.json')
  await Promise.all([
    fs.copyFile(aar, path.join(directory, ANDROID_SDK_FILES.aar)),
    fs.copyFile(apkPath, path.join(directory, ANDROID_SDK_FILES.build)),
    fs.copyFile(resolved, path.join(directory, ANDROID_SDK_FILES.resolved)),
  ])
  const [aarBytes, apkBytes, source] = await Promise.all([fs.readFile(aar), fs.readFile(apkPath), fs.readFile(resolved, 'utf8')])
  validateAndroidBuildFiles(aarBytes, apkBytes, JSON.parse(source) as ResolvedAndroidSdk, context)
}

/** 精确设备拉取安装后的 APK，保存原文件以便离线验证器重新读取。 */
export async function saveInstalledAndroidSdk(hostDir: string, artifactDir: string, device: AndroidDevice, context: NativeEvidenceContext) {
  const output = (await command('adb', adbArgs(device, ['shell', 'pm', 'path', LYNX_ANDROID_APPLICATION_ID]), hostDir, 30_000)).trim().split(/\r?\n/)
  if (output.length !== 1 || !/^package:\/[^\r\n]+\.apk$/.test(output[0]!)) {
    throw new Error('Lynx Android SDK 要求当前应用唯一 base APK')
  }
  const installedPath = output[0]!.slice('package:'.length)
  const directory = androidSdkDirectory(artifactDir)
  const installed = path.join(directory, ANDROID_SDK_FILES.installed)
  await command('adb', adbArgs(device, ['pull', installedPath, installed]), hostDir, 120_000)
  const abi = (await command('adb', adbArgs(device, ['shell', 'getprop', 'ro.product.cpu.abi']), hostDir, 30_000)).trim()
  const [builtBytes, installedBytes, resolved] = await Promise.all([
    fs.readFile(path.join(directory, ANDROID_SDK_FILES.build)),
    fs.readFile(installed),
    fs.readFile(path.join(directory, ANDROID_SDK_FILES.resolved)),
  ])
  const buildApkSha256 = androidSdkHash(builtBytes)
  const installedApkSha256 = androidSdkHash(installedBytes)
  const receipt = { version: 1, source: 'lynx-adb-installed-apk-v1', runId: context.runId, bundleSha256: context.bundleSha256, deviceId: device.id, applicationId: LYNX_ANDROID_APPLICATION_ID, installedPath, abi, buildApkSha256, installedApkSha256, resolvedSha256: androidSdkHash(resolved) }
  await fs.writeFile(path.join(directory, ANDROID_SDK_FILES.receipt), `${JSON.stringify(receipt, null, 2)}\n`, { flag: 'wx' })
  if (buildApkSha256 !== installedApkSha256) {
    throw new Error('Lynx Android SDK 构建和设备实际安装 APK 不一致')
  }
}
