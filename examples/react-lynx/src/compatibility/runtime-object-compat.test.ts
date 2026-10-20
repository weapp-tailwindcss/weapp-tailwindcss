import type { NativeAndroidSdkArtifact, NativeMediaGateEvidence, StaticCandidateEvidence } from './types'
import { describe, expect, it } from 'vitest'
import { ANDROID_SDK_REFERENCE, validateAndroidSdkArtifact } from './android-sdk-contract'
import { MEDIA_GATE_LIMITATION_ID, MEDIA_GATE_PROBE_IDS, MEDIA_GATE_SOURCE_SHA256, mediaGateRejection, validateMediaGateCandidate } from './media-gate-contract'

function withoutHasOwn<T>(run: () => T) {
  const descriptor = Object.getOwnPropertyDescriptor(Object, 'hasOwn')!
  Object.defineProperty(Object, 'hasOwn', { ...descriptor, value: undefined })
  try {
    return run()
  }
  finally {
    Object.defineProperty(Object, 'hasOwn', descriptor)
  }
}

const context = { version: 1 as const, runId: '00000000-0000-4000-8000-000000000001', bundleSha256: 'a'.repeat(64) }
const sdk: NativeAndroidSdkArtifact = {
  resolved: { version: 1, source: 'lynx-gradle-resolved-sdk-v1', runId: context.runId, bundleSha256: context.bundleSha256, component: ANDROID_SDK_REFERENCE.component, artifactVersion: ANDROID_SDK_REFERENCE.artifactVersion, aarSha256: ANDROID_SDK_REFERENCE.aarSha256, libraries: ANDROID_SDK_REFERENCE.libraries },
  abi: 'arm64-v8a',
  librarySha256: ANDROID_SDK_REFERENCE.libraries['arm64-v8a'],
  apkSha256: 'b'.repeat(64),
}

describe('Lynx 宿主不提供 Object.hasOwn 时的证据校验', () => {
  it('仍验证 Android release 身份，并拒绝继承的 ABI 键', () => {
    expect(() => withoutHasOwn(() => validateAndroidSdkArtifact(sdk, context, ANDROID_SDK_REFERENCE.reportedVersion))).not.toThrow()
    expect(() => withoutHasOwn(() => validateAndroidSdkArtifact({ ...sdk, abi: 'toString' }, context, ANDROID_SDK_REFERENCE.reportedVersion))).toThrow(/身份无效/)
  })

  it('仍完整比较媒体候选的独立证据，部分属性丢失必须拒绝', () => {
    const rect = (width: number, height: number) => ({ left: 0, top: 0, right: width, bottom: height, width, height })
    const evidence: NativeMediaGateEvidence = { limitationId: MEDIA_GATE_LIMITATION_ID, ...context, sdkVersion: '4.0.1', probes: MEDIA_GATE_PROBE_IDS.map(id => ({ id, probe: rect(id === 'unguarded' || id === 'min-width' ? 32 : 16, 16), container: rect(64, 64) })) }
    const rules = [{ selector: String.raw`.hover\:bg-\[\#ef4444\]:hover`, mediaConditions: ['(hover:hover)'] }]
    const built: StaticCandidateEvidence = { className: 'hover:bg-[#ef4444]', generated: true, bundled: true, mediaGuard: { className: 'hover:bg-[#ef4444]', limitationId: MEDIA_GATE_LIMITATION_ID, sourceSha256: MEDIA_GATE_SOURCE_SHA256, condition: '(hover:hover)', generatedRules: rules, bundledRules: rules } }
    const candidate = mediaGateRejection(built.className, built.mediaGuard, evidence)
    expect(() => withoutHasOwn(() => validateMediaGateCandidate(candidate, built, evidence, context))).not.toThrow()
    candidate.checkpoints = []
    expect(() => withoutHasOwn(() => validateMediaGateCandidate(candidate, built, evidence, context))).toThrow(/独立|完整/)
  })
})
