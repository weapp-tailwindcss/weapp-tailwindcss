import type { NativeEvidenceWriter } from './native-evidence'
import type { NativeCaseResult, NativeColorSchemeReceipt } from './types'

export interface ColorSchemeModule {
  setColorScheme?: (runId: string, requestId: string, scheme: 'light' | 'dark', callback: (value: NativeColorSchemeReceipt | null) => void) => void
  captureColorScheme?: (runId: string, requestId: string, id: string, callback: (value: string | null) => void) => void
}

const collecting = new WeakSet<ColorSchemeModule>()
let sequence = 0

function request<T>(invoke: (callback: (value: T | null) => void) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('原生颜色模式取证超时')), 2000)
    try {
      invoke((value) => {
        clearTimeout(timer)
        if (value === null) {
          reject(new Error('原生颜色模式取证缺证'))
        }
        else {
          resolve(value)
        }
      })
    }
    catch (error) {
      clearTimeout(timer)
      reject(error)
    }
  })
}

/** 锁住整个四帧采集及恢复；原生回执必须确认同一 run、请求和引擎刷新。 */
export async function collectColorScheme(reporter: ColorSchemeModule, evidence: NativeEvidenceWriter): Promise<NativeCaseResult> {
  if (collecting.has(reporter)) {
    throw new Error('原生颜色模式采集已在进行')
  }
  if (!reporter.setColorScheme || !reporter.captureColorScheme) {
    throw new Error('原生 host 缺少颜色模式取证协议')
  }
  collecting.add(reporter)
  const receipts = {} as NonNullable<NativeCaseResult['colorScheme']>
  const errors: unknown[] = []
  const switchScheme = async (scheme: 'light' | 'dark') => {
    const requestId = `color-scheme-${++sequence}`
    const receipt = await request<NativeColorSchemeReceipt>(callback => reporter.setColorScheme!(evidence.runId, requestId, scheme, callback))
    if (receipt.runId !== evidence.runId || receipt.requestId !== requestId || receipt.scheme !== scheme) {
      throw new Error('原生颜色模式回执身份不符')
    }
    return receipt
  }
  try {
    for (const scheme of ['light', 'dark'] as const) {
      const receipt = receipts[scheme] = await switchScheme(scheme)
      for (const frame of ['probe', 'control']) {
        const data = await request<string>(callback => reporter.captureColorScheme!(evidence.runId, receipt.requestId, `${frame}-container-variant-dark`, callback))
        await evidence.save(`variant-dark-${scheme}-${frame}.png`, data)
      }
    }
  }
  catch (error) {
    errors.push(error)
  }
  finally {
    try {
      receipts.restored = await switchScheme('light')
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
    reason: '已采集颜色模式四帧及恢复回执，等待宿主验证预期效果',
    checkpoints: [{ name: 'pixel:color-scheme-v1', passed: false }],
    colorScheme: receipts,
  }
}
