import type { HmrContext } from 'vite'

/** 兼容 Vite 同步或异步的 HMR 源码读取，并沿用读取失败后的候选扫描。 */
export async function readViteHmrSource(context: Pick<HmrContext, 'read'>) {
  try {
    return await context.read?.()
  }
  catch {
    return undefined
  }
}
