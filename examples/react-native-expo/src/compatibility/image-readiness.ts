import type { NativeImageEvidence, NativeImageLoad, NativeImageSide } from './image-fixture'
import type { ReactNativePlatform } from './protocol'

type ImageIdentity = Pick<NativeImageLoad, 'revision' | 'id' | 'phase'>
const sides: NativeImageSide[] = ['probe', 'reference', 'control']

function observedLoad(event: unknown, platform: ReactNativePlatform) {
  const native = (event as { nativeEvent?: { source?: { width?: unknown, height?: unknown, uri?: unknown }, target?: { naturalWidth?: unknown, naturalHeight?: unknown, currentSrc?: unknown, src?: unknown } } })?.nativeEvent
  const source = platform === 'web' ? native?.target : native?.source
  const width = platform === 'web' ? native?.target?.naturalWidth : native?.source?.width
  const height = platform === 'web' ? native?.target?.naturalHeight : native?.source?.height
  const uri = platform === 'web' ? native?.target?.currentSrc || native?.target?.src : native?.source?.uri
  if (!source || typeof width !== 'number' || typeof height !== 'number' || !Number.isFinite(width) || !Number.isFinite(height)
    || width <= 0 || height <= 0 || typeof uri !== 'string' || !uri) {
    throw new Error('Image onLoad 缺少实际解码尺寸或源 URI')
  }
  return { origin: platform === 'web' ? 'web-target' as const : 'native-source' as const, width, height, uri }
}

/** 每个案例独立持有事件，缓存命中早于 effect 时也不会丢失；回调不更新 React 状态。 */
export function createImageReadiness(identity: ImageIdentity, platform: ReactNativePlatform) {
  const loads = new Map<NativeImageSide, NativeImageLoad>()
  const listeners = new Set<() => void>()
  let failure: Error | undefined
  let closed = false
  const fail = (error: unknown) => {
    failure ??= error instanceof Error ? error : new Error(String(error))
    for (const notify of listeners) {
      notify()
    }
  }
  const callbacks = Object.fromEntries(sides.map(side => [side, {
    onLoad: (event: unknown) => {
      if (closed) {
        return
      }
      try {
        if (loads.has(side)) {
          throw new Error(`Image 重复 onLoad: ${side}`)
        }
        loads.set(side, { ...identity, side, event: 'load', ...observedLoad(event, platform) })
        for (const notify of listeners) {
          notify()
        }
      }
      catch (error) { fail(error) }
    },
    onError: (event: unknown) => {
      if (!closed) {
        fail(new Error(`Image 加载失败 ${side}: ${String((event as { nativeEvent?: { error?: unknown } })?.nativeEvent?.error ?? event)}`))
      }
    },
  }])) as Record<NativeImageSide, { onLoad: (event: unknown) => void, onError: (event: unknown) => void }>
  return {
    callbacks,
    wait: (signal: AbortSignal): Promise<NativeImageEvidence> => new Promise((resolve, reject) => {
      const finish = (error?: unknown) => {
        clearTimeout(timer)
        listeners.delete(check)
        signal.removeEventListener('abort', abort)
        if (error) {
          reject(error)
        }
        else {
          resolve({ version: 1, loads: sides.map(side => loads.get(side)!) })
        }
      }
      const abort = () => finish(signal.reason ?? new Error('Image 所属阶段取消'))
      const check = () => {
        if (signal.aborted) {
          abort()
        }
        else if (failure || closed) {
          finish(failure ?? new Error('Image 所属案例结束'))
        }
        else if (loads.size === sides.length) {
          finish()
        }
      }
      const timer = setTimeout(() => finish(new Error('Image onLoad 等待超过 5000ms')), 5_000)
      listeners.add(check)
      signal.addEventListener('abort', abort, { once: true })
      check()
    }),
    dispose: () => {
      closed = true
      for (const notify of listeners) {
        notify()
      }
    },
  }
}
