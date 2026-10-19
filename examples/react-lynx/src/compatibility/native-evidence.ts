import type { NativeGeometryCapture } from './native-geometry'
import type { NativeArtifactReceipt, NativeEvidenceContext, NativePlatformReport } from './types'
import { geometryArtifactNames, validNativeGeometry } from './native-geometry'

export interface EvidenceModule {
  getEvidenceContext?: (callback: (value: NativeEvidenceContext | null) => void) => void
  submitArtifact?: (runId: string, name: string, data: string, callback: (value: NativeArtifactReceipt | null) => void) => void
  captureGeometry?: (runId: string, id: string, callback: (value: NativeGeometryCapture | null) => void) => void
  submit?: (runId: string, report: string, callback: (value: boolean) => void) => void
  fail?: (runId: string, message: string, callback: (value: boolean) => void) => void
}

function request<T>(invoke: (callback: (value: T) => void) => void, timeoutMs = 2000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('原生 evidence 写入回执超时')), timeoutMs)
    try {
      invoke((value) => {
        clearTimeout(timer)
        resolve(value)
      })
    }
    catch (error) {
      clearTimeout(timer)
      reject(error)
    }
  })
}

/** 每次采集独立持有身份和回执；超时或迟到回调不能发布成功报告。 */
export async function createNativeEvidence(reporter: EvidenceModule) {
  if (!reporter.getEvidenceContext || !reporter.submitArtifact || !reporter.submit) {
    throw new Error('原生 host 缺少 evidence 协议')
  }
  // 首次回执可能排在宿主首屏布局之后；上下文阶段单独使用较宽期限，后续截图仍保持短回执门禁。
  const context = await request<NativeEvidenceContext | null>(callback => reporter.getEvidenceContext!(callback), 15_000)
  if (context?.version !== 1 || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(context.runId) || !/^[a-f0-9]{64}$/.test(context.bundleSha256)) {
    throw new Error('原生 host 未提供有效的 evidence 身份')
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
    async geometry(id: string) {
      pending++
      try {
        if (failed || submitted || !reporter.captureGeometry) {
          throw new Error('evidence 已失败、结束或缺少原生几何采集协议')
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
