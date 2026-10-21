import type { NativeImageEvidence, NativeImageLoad, NativeImageSide } from './image-fixture'
import type { ReactNativePlatform } from './protocol'
import type { WebImageHost } from './web-image-observation'
import { nativeImageFixture } from './image-fixture'
import { observeWebImage } from './web-image-observation'

type ImageIdentity = Pick<NativeImageLoad, 'revision' | 'id' | 'phase'>
const sides: NativeImageSide[] = ['probe', 'reference', 'control']

function observedNativeLoad(event: unknown) {
  const source = (event as { nativeEvent?: { source?: { width?: unknown, height?: unknown, uri?: unknown } } })?.nativeEvent?.source
  const { width, height, uri } = source ?? {}
  if (!source || typeof width !== 'number' || typeof height !== 'number' || !Number.isFinite(width) || !Number.isFinite(height)
    || width <= 0 || height <= 0 || typeof uri !== 'string' || !uri) {
    throw new Error('Image onLoad 缺少实际解码尺寸或源 URI')
  }
  return { origin: 'native-source' as const, width, height, uri }
}

/** 每个案例独立持有事件，缓存命中早于 effect 时也不会丢失；回调不更新 React 状态。 */
export function createImageReadiness(identity: ImageIdentity, platform: ReactNativePlatform, webHost?: WebImageHost) {
  const loads = new Map<NativeImageSide, NativeImageLoad>()
  const started = new Set<NativeImageSide>()
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
        if (started.has(side)) {
          throw new Error(`Image 重复 onLoad: ${side}`)
        }
        started.add(side)
        const save = (observed: Omit<NativeImageLoad, keyof ImageIdentity | 'side' | 'event'>) => {
          if (!closed && !failure) {
            loads.set(side, { ...identity, side, event: 'load', ...observed })
            for (const notify of listeners) {
              notify()
            }
          }
        }
        if (platform === 'web') {
          const native = (event as { nativeEvent?: { type?: string, isTrusted?: boolean } })?.nativeEvent
          if (!webHost || native?.type !== 'load' || native.isTrusted !== true) {
            throw new Error('Image Web 缺少当前宿主或真实 load 事件')
          }
          void observeWebImage(() => webHost(side), nativeImageFixture.uri).then(observed => save({ ...observed, trusted: true })).catch((error) => {
            if (!closed) {
              fail(error)
            }
          })
        }
        else {
          save(observedNativeLoad(event))
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
          resolve({ version: 2, loads: sides.map(side => loads.get(side)!) })
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
