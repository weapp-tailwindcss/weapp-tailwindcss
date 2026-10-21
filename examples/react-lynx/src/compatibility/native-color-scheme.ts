import type { NativeEvidenceWriter } from './native-evidence'
import type { NativeBridgeResult } from './native-failure'
import type { NativeCaseResult, NativeColorSchemeReceipt } from './types'
import { colorSchemeContract } from './color-scheme-contract'
import { NativeOperationError } from './native-error-diagnostics'
import { NativeEvidenceUnavailableError, requestNativeReceipt } from './native-failure'

export interface ColorSchemeModule {
  setColorScheme?: (runId: string, requestId: string, scheme: 'light' | 'dark', callback: (value: NativeBridgeResult<NativeColorSchemeReceipt | null>) => void) => void
  captureColorScheme?: (runId: string, requestId: string, id: string, callback: (value: NativeBridgeResult<string | null>) => void) => void
}

const collecting = new WeakSet<ColorSchemeModule>()
let sequence = 0

async function request<T>(invoke: (callback: (value: NativeBridgeResult<T | null>) => void) => void): Promise<T> {
  const value = await requestNativeReceipt(invoke)
  if (value === null) {
    throw new Error('原生颜色模式取证缺证')
  }
  return value
}

/** 锁住整个六帧采集及恢复；原生回执必须确认同一 run、请求和引擎刷新。 */
export async function collectColorScheme(reporter: ColorSchemeModule, evidence: NativeEvidenceWriter): Promise<NativeCaseResult> {
  if (collecting.has(reporter)) {
    throw new Error('原生颜色模式采集已在进行')
  }
  if (!reporter.setColorScheme || !reporter.captureColorScheme) {
    throw new NativeEvidenceUnavailableError('bridge-unavailable', '原生 host 缺少颜色模式取证协议')
  }
  collecting.add(reporter)
  const receipts = {} as NonNullable<NativeCaseResult['colorScheme']>
  const errors: unknown[] = []
  const switchScheme = async (scheme: 'light' | 'dark', phase: 'light' | 'dark' | 'restored' = scheme) => {
    const requestId = `color-scheme-${++sequence}`
    try {
      const receipt = await request<NativeColorSchemeReceipt>(callback => reporter.setColorScheme!(evidence.runId, requestId, scheme, callback))
      if (receipt.runId !== evidence.runId || receipt.requestId !== requestId || receipt.scheme !== scheme) {
        throw new Error('原生颜色模式回执身份不符')
      }
      return receipt
    }
    catch (error) {
      throw new NativeOperationError({ phase, operation: 'switch', runId: evidence.runId, requestId }, error)
    }
  }
  const capture = async (phase: 'light' | 'dark' | 'restored', receipt: NativeColorSchemeReceipt) => {
    for (const frame of ['probe', 'control']) {
      const node = `${frame}-container-variant-dark`
      const artifact = `variant-dark-${phase}-${frame}.png`
      const context = { phase, runId: evidence.runId, requestId: receipt.requestId, node, artifact }
      let data: string
      try {
        data = await request<string>(callback => reporter.captureColorScheme!(evidence.runId, receipt.requestId, node, callback))
      }
      catch (error) {
        throw new NativeOperationError({ ...context, operation: 'capture' }, error)
      }
      try {
        await evidence.save(artifact, data)
      }
      catch (error) {
        throw new NativeOperationError({ ...context, operation: 'save' }, error)
      }
    }
  }
  try {
    for (const scheme of ['light', 'dark'] as const) {
      const receipt = receipts[scheme] = await switchScheme(scheme)
      await capture(scheme, receipt)
    }
  }
  catch (error) {
    errors.push(error)
  }
  finally {
    try {
      receipts.restored = await switchScheme('light', 'restored')
      if (errors.length === 0) {
        await capture('restored', receipts.restored)
      }
    }
    catch (error) {
      errors.push(new Error('原生颜色模式恢复失败', { cause: error }))
    }
    collecting.delete(reporter)
  }
  if (errors.length) {
    throw new AggregateError(errors, '原生颜色模式采集或恢复失败')
  }
  return {
    id: 'variant-dark',
    status: 'not-tested',
    reason: '已采集颜色模式六帧及恢复回执，等待宿主验证预期效果',
    checkpoints: [{ name: colorSchemeContract.checkpoint, passed: false }],
    colorScheme: receipts,
  }
}
