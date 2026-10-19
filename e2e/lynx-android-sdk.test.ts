import type { NativePlatformReport } from '../examples/react-lynx/src/compatibility/types'
import { Buffer } from 'node:buffer'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { validateAndroidSdkEvidence } from './lynx/android-sdk'
import { createEvidenceContext, validateNativeEvidence } from './lynx/evidence'
import { sdkFixture, sdkReference } from './lynx/fixtures/android-sdk'
import { validateMediaGateArtifacts } from './lynx/media-gate'

// 仅本文件使用小型合成 AAR；生产合同始终绑定仓库登记的官方原始指纹。
vi.mock('../examples/react-lynx/src/compatibility/android-sdk-reference.json', async () => ({ default: (await import('./lynx/fixtures/android-sdk')).sdkReference }))

const directories: string[] = []
afterEach(async () => {
  await Promise.all(directories.splice(0).map(directory => fs.rm(directory, { recursive: true, force: true })))
})

async function fixture() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'lynx sdk identity '))
  directories.push(directory)
  return { directory, ...await sdkFixture(directory) }
}

it('保留原始 SDK 自报值，同时重读本轮 resolved AAR、构建和安装 APK、原生侧车', async () => {
  const { directory, report, context } = await fixture()
  expect(report.mediaGate!.sdkVersion).toBe('0.0.1')
  expect(report.mediaGate!.sdkArtifact!.resolved.artifactVersion).toBe('4.0.1')
  await expect(validateAndroidSdkEvidence(report, directory, context)).resolves.toBeUndefined()
})

it.each(['missing-artifact', 'forged-reported-version', 'resolved-version', 'aar-bytes', 'built-apk', 'installed-apk', 'abi-library', 'abi', 'run', 'bundle', 'old-sidecar', 'js-sidecar', 'sidecar-hash', 'missing-receipt', 'old-receipt', 'missing-file', 'zip-identity'] as const)('离线重新读取并拒绝 %s，不能用声明或摘要放行', async (mode) => {
  const { directory, report, context, files, sidecarPath, rewriteApk, resignSidecar } = await fixture()
  const artifact = report.mediaGate!.sdkArtifact!
  if (mode === 'missing-artifact') {
    delete report.mediaGate!.sdkArtifact
  }
  if (mode === 'forged-reported-version') {
    report.mediaGate!.sdkVersion = '4.0.1'
  }
  if (mode === 'resolved-version') {
    artifact.resolved.artifactVersion = '4.2.0'
  }
  if (mode === 'aar-bytes') {
    await fs.appendFile(files.aar, Buffer.from('changed AAR'))
  }
  if (mode === 'built-apk') {
    await fs.appendFile(files.build, 'changed APK')
  }
  if (mode === 'installed-apk') {
    await fs.appendFile(files.installed, 'different installed APK')
  }
  if (mode === 'abi-library') {
    await rewriteApk({ library: Buffer.from('different native code') })
  }
  if (mode === 'abi') {
    report.environment.abi = 'arm64-v8a'
  }
  if (mode === 'run') {
    artifact.resolved.runId = createEvidenceContext(Buffer.from('old')).runId
  }
  if (mode === 'bundle') {
    artifact.resolved.bundleSha256 = 'c'.repeat(64)
  }
  if (mode === 'missing-file') {
    await fs.rm(files.aar)
  }
  if (mode === 'missing-receipt') {
    await fs.rm(files.receipt)
  }
  if (mode === 'old-receipt') {
    const receipt = JSON.parse(await fs.readFile(files.receipt, 'utf8'))
    receipt.runId = createEvidenceContext(Buffer.from('old')).runId
    await fs.writeFile(files.receipt, JSON.stringify(receipt))
  }
  if (mode === 'zip-identity') {
    await rewriteApk({ context: { ...context, bundleSha256: 'c'.repeat(64) } })
  }
  if (['old-sidecar', 'js-sidecar', 'sidecar-hash'].includes(mode)) {
    const sidecar = JSON.parse(await fs.readFile(sidecarPath, 'utf8'))
    if (mode === 'old-sidecar') {
      sidecar.context.runId = 'old'
    }
    if (mode === 'js-sidecar') {
      sidecar.source = 'javascript-reporter'
    }
    if (mode === 'sidecar-hash') {
      sidecar.mediaGate.sdkArtifact.apkSha256 = 'c'.repeat(64)
    }
    await fs.writeFile(sidecarPath, JSON.stringify(sidecar))
    await resignSidecar()
  }
  const semanticErrors = { 'old-sidecar': /native sidecar context/, 'js-sidecar': /原生侧车来源/, 'sidecar-hash': /native sidecar artifact/ }
  const error = semanticErrors[mode as keyof typeof semanticErrors]
  await expect(validateAndroidSdkEvidence(report, directory, context)).rejects.toThrow(error)
})

it('最终 Android 验收强制 artifact，不允许 SDK 自报 4.0.1 冒充 iOS 证据', async () => {
  const context = createEvidenceContext(Buffer.from('bundle'))
  const report = { platform: 'android', mediaGate: { sdkVersion: '4.0.1' } } as NativePlatformReport
  await expect(validateNativeEvidence(report, os.tmpdir(), context)).rejects.toThrow(/Android.*SDK.*artifact/)
})

it('iOS 夹带 Android 证明和 raw 0.0.1 时，即使原生侧车与回执一致也拒绝', async () => {
  const { directory, report, context, sidecarPath, resignSidecar } = await fixture()
  report.platform = 'ios'
  const rect = (width: number, height: number) => ({ left: 0, top: 0, right: width, bottom: height, width, height })
  Object.assign(report.mediaGate!, {
    limitationId: 'lynx4.0.1-media-hover-unknown-v1',
    probes: (['base', 'control', 'unguarded', 'min-width', 'hover-hover', 'hover-none'] as const).map(id => ({ id, probe: rect(id === 'unguarded' || id === 'min-width' ? 32 : 16, 16), container: rect(64, 64) })),
  })
  const sidecar = JSON.parse(await fs.readFile(sidecarPath, 'utf8'))
  sidecar.mediaGate = report.mediaGate
  await fs.writeFile(sidecarPath, JSON.stringify(sidecar))
  await resignSidecar()
  await expect(validateNativeEvidence(report, directory, context)).rejects.toThrow(/iOS SDK.*Android artifact/)
  await expect(validateMediaGateArtifacts(report, path.dirname(sidecarPath))).rejects.toThrow(/iOS SDK.*Android artifact/)
})

it('测试 AAR 身份必须来自合成参考夹具，避免测试误登记官方字节', () => {
  expect(sdkReference.artifactVersion).toBe('4.0.1')
  expect(sdkReference.aarSha256).not.toBe('e04d7b62a8ecb9255b7993cbbae93abca3196949a1c7c23477618ec07cc557e2')
})
