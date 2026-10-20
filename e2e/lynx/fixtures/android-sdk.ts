import type { NativeEvidenceContext, NativePlatformReport, ResolvedAndroidSdk } from '../../../examples/react-lynx/src/compatibility/types'
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { zipFixture } from './zip'

const hash = (value: Uint8Array) => createHash('sha256').update(value).digest('hex')
const library = Buffer.from('synthetic fixture, never official Lynx code')
const aar = zipFixture([['jni/x86_64/liblynx.so', library]])
export const sdkReference = { component: 'org.lynxsdk.lynx:lynx:4.0.1', artifactVersion: '4.0.1', reportedVersion: '0.0.1', aarSha256: hash(aar), libraries: { x86_64: hash(library) } }

export async function sdkFixture(directory: string) {
  const bundle = Buffer.from('synthetic current bundle')
  const context: NativeEvidenceContext = { version: 1, runId: '00000000-0000-4000-8000-000000000001', bundleSha256: hash(bundle) }
  const resolved: ResolvedAndroidSdk = { ...context, source: 'lynx-gradle-resolved-sdk-v1', component: sdkReference.component, artifactVersion: sdkReference.artifactVersion, aarSha256: sdkReference.aarSha256, libraries: sdkReference.libraries }
  const sdk = path.join(directory, 'android-sdk')
  const crops = path.join(directory, 'crops', context.runId)
  await fs.mkdir(sdk, { recursive: true })
  await fs.mkdir(crops, { recursive: true })
  const files = { aar: path.join(sdk, 'resolved.aar'), build: path.join(sdk, 'build.apk'), installed: path.join(sdk, 'installed.apk'), resolved: path.join(sdk, 'resolved.json'), receipt: path.join(sdk, 'installation.json') }
  const resolvedSource = JSON.stringify(resolved)
  const apk = (overrides: { library?: Uint8Array, context?: NativeEvidenceContext } = {}) => zipFixture([
    ['assets/lynx-sdk-identity.json', Buffer.from(resolvedSource)],
    ['assets/run-context.json', Buffer.from(JSON.stringify(overrides.context ?? context))],
    ['assets/main.lynx.bundle', bundle], ['lib/x86_64/liblynx.so', overrides.library ?? library],
  ], true)
  const report = { platform: 'android', mediaGate: { ...context, sdkVersion: '0.0.1', sdkArtifact: { resolved: structuredClone(resolved), apkSha256: hash(apk()), abi: 'x86_64', librarySha256: hash(library) } }, environment: { abi: 'x86_64' }, evidence: { ...context, artifacts: [] } } as unknown as NativePlatformReport
  const sidecarPath = path.join(crops, 'media-hover-v1.native.json')
  const resignSidecar = async () => {
    const bytes = await fs.readFile(sidecarPath)
    report.evidence!.artifacts = [{ runId: context.runId, name: 'media-hover-v1.native.json', sha256: hash(bytes), byteLength: bytes.length }]
  }
  const writeSidecar = async () => {
    const bytes = Buffer.from(JSON.stringify({ version: 1, source: 'lynx-native-media-gate-v1', context, mediaGate: report.mediaGate }))
    await fs.writeFile(sidecarPath, bytes)
    await resignSidecar()
  }
  const rewriteApk = async (overrides: Parameters<typeof apk>[0] = {}) => {
    const bytes = apk(overrides)
    report.mediaGate!.sdkArtifact!.apkSha256 = hash(bytes)
    await fs.writeFile(files.build, bytes)
    await fs.writeFile(files.installed, bytes)
    await fs.writeFile(files.receipt, JSON.stringify({ ...context, source: 'lynx-adb-installed-apk-v1', deviceId: 'emulator-fixture', applicationId: 'com.weapptailwindcss.lynxcompat', installedPath: '/data/app/fixture/base.apk', abi: 'x86_64', buildApkSha256: hash(bytes), installedApkSha256: hash(bytes), resolvedSha256: hash(Buffer.from(resolvedSource)) }))
    await writeSidecar()
  }
  await fs.writeFile(files.aar, aar)
  await fs.writeFile(files.resolved, resolvedSource)
  await fs.writeFile(path.join(directory, 'device.json'), JSON.stringify({ platform: 'android', id: 'emulator-fixture' }))
  await rewriteApk()
  return { report, context, files, sidecarPath, rewriteApk, resignSidecar }
}
