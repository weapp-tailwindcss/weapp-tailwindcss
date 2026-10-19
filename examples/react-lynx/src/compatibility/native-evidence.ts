import type { NativeBridgeResult } from './native-failure'
import type { NativeGeometryCapture } from './native-geometry'
import type { ResponsiveCapture, ResponsivePhase } from './responsive-contract'
import type { NativeArtifactReceipt, NativeEvidenceContext, NativeMediaGateCapture, NativePlatformReport } from './types'
import { mediaGateArtifactNames, validateMediaGateEvidence } from './media-gate-contract'
import { NativeEvidenceUnavailableError, requestNativeReceipt as request } from './native-failure'
import { geometryArtifactNames, validNativeGeometry } from './native-geometry'
import { responsiveArtifactNames, validResponsiveFrame } from './responsive-contract'

export interface EvidenceModule {
  getEvidenceContext?: (callback: (value: NativeBridgeResult<NativeEvidenceContext | null>) => void) => void
  submitArtifact?: (runId: string, name: string, data: string, callback: (value: NativeBridgeResult<NativeArtifactReceipt | null>) => void) => void
  captureGeometry?: (runId: string, id: string, callback: (value: NativeBridgeResult<NativeGeometryCapture | null>) => void) => void
  captureResponsive?: (runId: string, requestId: string, phase: ResponsivePhase, callback: (value: NativeBridgeResult<ResponsiveCapture | null>) => void) => void
  captureMediaGate?: (runId: string, callback: (value: NativeBridgeResult<NativeMediaGateCapture | null>) => void) => void
  submit?: (runId: string, report: string, callback: (value: NativeBridgeResult<boolean>) => void) => void
  fail?: (runId: string, message: string, callback: (value: boolean) => void) => void
}

/** 每次采集独立持有身份和回执；超时或迟到回调不能发布成功报告。 */
export async function createNativeEvidence(reporter: EvidenceModule) {
  if (!reporter.getEvidenceContext || !reporter.submitArtifact || !reporter.submit) {
    throw new NativeEvidenceUnavailableError('bridge-unavailable', '原生 host 缺少 evidence 协议')
  }
  // 首次回执可能排在宿主首屏布局之后；上下文阶段单独使用较宽期限，后续截图仍保持短回执门禁。
  const context = await request<NativeEvidenceContext | null>(callback => reporter.getEvidenceContext!(callback), 15_000)
  if (context?.version !== 1 || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(context.runId) || !/^[a-f0-9]{64}$/.test(context.bundleSha256)) {
    throw new NativeEvidenceUnavailableError('bridge-unavailable', '原生 host 未提供有效的 evidence 身份')
  }
  const artifacts: NativeArtifactReceipt[] = []
  let failed = false
  let pending = 0
  let submitted = false
  function register(receipt: NativeArtifactReceipt | null | undefined, name: string) {
    if (!receipt || receipt.runId !== context!.runId || receipt.name !== name || !/^[a-f0-9]{64}$/.test(receipt.sha256) || !Number.isSafeInteger(receipt.byteLength) || receipt.byteLength <= 0 || artifacts.some(item => item.name === name)) {
      throw new Error(`原生截图写入回执无效：${name}`)
    }
    artifacts.push(receipt)
  }
  return {
    runId: context.runId,
    async responsive(phase: ResponsivePhase, requestId: string) {
      pending++
      try {
        // 恢复调用必须穿过已失败的采集状态，先恢复根布局，再拒绝发布。
        if (submitted || (failed && phase !== 'restored')) {
          throw new Error('evidence 已失败或结束')
        }
        if (!reporter.captureResponsive) {
          throw new NativeEvidenceUnavailableError('geometry-unavailable', '原生 host 缺少根 viewport 取证协议')
        }
        const capture = await request<ResponsiveCapture | null>(callback => reporter.captureResponsive!(context.runId, requestId, phase, callback), 5000)
        const names = responsiveArtifactNames(phase)
        if (!capture || !validResponsiveFrame(capture.frame, context.runId, phase, requestId) || capture.artifacts?.length !== names.length) {
          throw new Error('响应式宿主回执或落盘清单无效')
        }
        for (const name of names) {
          register(capture.artifacts.find(item => item.name === name), name)
        }
        return capture.frame
      }
      catch (error) {
        failed = true
        throw error
      }
      finally {
        pending--
      }
    },
    async mediaGate() {
      pending++
      try {
        if (failed || submitted) {
          throw new Error('evidence 已失败或结束')
        }
        if (!reporter.captureMediaGate) {
          throw new Error('原生 host 缺少 media gate 采集协议')
        }
        const capture = await request<NativeMediaGateCapture | null>(callback => reporter.captureMediaGate!(context.runId, callback), 5000)
        validateMediaGateEvidence(capture?.mediaGate, context)
        const names = mediaGateArtifactNames()
        if (!capture || !Array.isArray(capture.artifacts) || capture.artifacts.length !== names.length) {
          throw new Error('原生 media gate 落盘清单不完整')
        }
        for (const name of names) {
          register(capture.artifacts.find(item => item.name === name), name)
        }
        return capture.mediaGate!
      }
      catch (error) {
        failed = true
        throw error
      }
      finally {
        pending--
      }
    },
    async geometry(id: string) {
      pending++
      try {
        if (failed || submitted) {
          throw new Error('evidence 已失败或结束')
        }
        if (!reporter.captureGeometry) {
          throw new NativeEvidenceUnavailableError('geometry-unavailable', '原生 host 缺少原生几何采集协议')
        }
        const names = geometryArtifactNames(id)
        const capture = await request<NativeGeometryCapture | null>(callback => reporter.captureGeometry!(context.runId, id, callback), 5000)
        if (!capture || !validNativeGeometry(capture.geometry) || !Array.isArray(capture.artifacts) || capture.artifacts.length !== names.length) {
          throw new Error(`原生几何或落盘清单无效：${id}`)
        }
        for (const name of names) {
          register(capture.artifacts.find(item => item.name === name), name)
        }
        return capture.geometry
      }
      catch (error) {
        failed = true
        throw error
      }
      finally {
        pending--
      }
    },
    async save(name: string, data: string | undefined) {
      pending++
      try {
        if (failed || submitted) {
          throw new Error('evidence 已失败或结束')
        }
        if (!data) {
          throw new Error(`原生截图缺失：${name}`)
        }
        const receipt = await request<NativeArtifactReceipt | null>(callback => reporter.submitArtifact!(context.runId, name, data, callback))
        register(receipt, name)
      }
      catch (error) {
        failed = true
        throw error
      }
      finally {
        pending--
      }
    },
    async submit(report: NativePlatformReport) {
      if (failed || pending > 0 || submitted) {
        throw new Error('evidence 未全部确认、已失败或已提交')
      }
      submitted = true
      report.evidence = { ...context, artifacts: [...artifacts] }
      const accepted = await request<boolean>(callback => reporter.submit!(context.runId, JSON.stringify(report), callback))
      if (accepted !== true) {
        throw new Error('原生 host 未确认报告落盘')
      }
    },
  }
}

export type NativeEvidenceWriter = Awaited<ReturnType<typeof createNativeEvidence>>
