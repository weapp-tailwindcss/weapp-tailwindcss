import type { Page } from '@playwright/test'
import type { CaptureBudget } from './capture'
import { randomUUID } from 'node:crypto'
import { createCaptureBudget } from './capture'

interface PreparationState {
  cancelled: boolean
  scrolled: boolean
  cancelPending?: () => void
  dispose?: () => void
  window: { x: number, y: number }
  elements: { element: HTMLElement, x: number, y: number }[]
}

/** 对普通 document 的图片真实加载、解码，结束后核对原滚动状态；不覆盖 iframe/shadow 内容。 */
export async function prepareFullPageImages(page: Page, budget: CaptureBudget) {
  const key = `weapp-full-page-images:${randomUUID()}`
  let failure: unknown
  try {
    await budget.run(() => page.evaluate(async (key) => {
      const visibleImages = () => [...document.images].filter(image => image.getClientRects().length > 0
        && getComputedStyle(image).visibility === 'visible')
      if (!visibleImages().length) {
        return
      }
      const symbol = Symbol.for(key)
      const state: PreparationState = {
        cancelled: false,
        scrolled: false,
        window: { x: scrollX, y: scrollY },
        elements: [...document.querySelectorAll<HTMLElement>('*')]
          .filter(element => element.scrollHeight > element.clientHeight || element.scrollWidth > element.clientWidth)
          .map(element => ({ element, x: element.scrollLeft, y: element.scrollTop })),
      }
      Reflect.set(window, symbol, state)
      const prepared = new WeakMap<HTMLImageElement, string>()
      const generations = new WeakMap<HTMLImageElement, number>()
      const listeners = new AbortController()
      state.dispose = () => listeners.abort()
      const track = (image: HTMLImageElement) => {
        if (generations.has(image)) {
          return
        }
        generations.set(image, 0)
        // 同一地址重新加载也不能复用本轮旧解码结果；监听器随本次准备结束清理。
        const advance = () => generations.set(image, generations.get(image)! + 1)
        image.addEventListener('load', advance, { signal: listeners.signal })
        image.addEventListener('error', advance, { signal: listeners.signal })
      }
      const resource = (image: HTMLImageElement) => JSON.stringify([
        image.currentSrc,
        image.src,
        image.srcset,
        image.sizes,
        generations.get(image),
      ])
      const findPending = () => visibleImages().filter((image) => {
        track(image)
        return !image.complete || image.naturalWidth === 0 || prepared.get(image) !== resource(image)
      })
      try {
        for (;;) {
          if (state.cancelled) {
            return
          }
          // 每轮固定真实节点与当前资源身份；状态变化后终止旧批次，立即重新扫描。
          const pending = findPending()
          if (!pending.length) {
            return
          }
          for (const image of pending) {
            if (state.cancelled) {
              return
            }
            if (!image.isConnected) {
              break
            }
            const identity = resource(image)
            if (!image.complete || image.naturalWidth === 0) {
              const loaded = new Promise<void>((resolve, reject) => {
                const loading = new AbortController()
                const finish = (error?: Error) => {
                  loading.abort()
                  state.cancelPending = undefined
                  error ? reject(error) : resolve()
                }
                const imageError = () => new Error(`整页截图图片加载失败：${image.currentSrc || image.src}`)
                state.cancelPending = () => finish(new Error('整页截图图片准备已取消'))
                image.addEventListener('load', () => finish(), { once: true, signal: loading.signal })
                image.addEventListener('error', () => finish(imageError()), { once: true, signal: loading.signal })
                if (image.complete) {
                  finish(image.naturalWidth > 0 ? undefined : imageError())
                }
              })
              state.scrolled = true
              image.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' })
              try {
                // Firefox 尚未开始 lazy request 时直接 decode 会拒绝，须等待真实 load/error。
                await loaded
              }
              catch (error) {
                if (state.cancelled) {
                  return
                }
                if (!image.isConnected || resource(image) !== identity) {
                  break
                }
                throw error
              }
              if (state.cancelled) {
                return
              }
              // load 会推进资源代际；下一轮只对加载后的稳定资源履行解码。
              if (!image.isConnected || resource(image) !== identity) {
                break
              }
            }
            try {
              // complete 只证明加载状态；已完成加载的图片同样必须履行解码屏障。
              await image.decode()
            }
            catch (error) {
              if (state.cancelled) {
                return
              }
              if (!image.isConnected || resource(image) !== identity) {
                break
              }
              throw new Error(`整页截图图片解码失败：${image.currentSrc || image.src}；${String(error)}`)
            }
            // 截止后的迟到解码结果不能继续读取图片状态、标记资源或启动下一张图。
            if (state.cancelled) {
              return
            }
            if (!image.isConnected || resource(image) !== identity || !image.complete) {
              break
            }
            if (image.naturalWidth <= 0) {
              throw new Error(`整页截图图片缺少有效像素：${image.currentSrc || image.src}`)
            }
            prepared.set(image, identity)
          }
        }
      }
      finally {
        state.dispose?.()
      }
    }, key))
  }
  catch (error) {
    failure = error
  }
  // 超时不取消浏览器中的 decode；先取消本轮循环，保证迟到结果不会再次滚动。
  // 独立预算只供收尾，不允许继续采集；状态存在浏览器中，无需保留迟到的远程句柄。
  try {
    await createCaptureBudget(1000).run(() => page.evaluate(async (key) => {
      const symbol = Symbol.for(key)
      const state = Reflect.get(window, symbol) as PreparationState | undefined
      if (!state) {
        return
      }
      state.cancelled = true
      state.cancelPending?.()
      state.dispose?.()
      try {
        if (state.scrolled) {
          for (const { element, x, y } of state.elements) {
            if (element.isConnected) {
              element.scrollTo({ left: x, top: y, behavior: 'instant' })
            }
          }
          scrollTo({ left: state.window.x, top: state.window.y, behavior: 'instant' })
          await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
        }
        // 未执行本轮滚动时只核对原状态，不擅自撤销页面自身的移动。
        if (scrollX !== state.window.x || scrollY !== state.window.y
          || state.elements.some(({ element, x, y }) => element.isConnected && (element.scrollLeft !== x || element.scrollTop !== y))) {
          throw new Error('整页截图图片准备后无法恢复原滚动位置')
        }
      }
      finally {
        Reflect.deleteProperty(window, symbol)
      }
    }, key))
  }
  catch (error) {
    throw new AggregateError([...(failure ? [failure] : []), error], '整页截图图片准备或滚动恢复失败')
  }
  if (failure) {
    throw failure
  }
  budget.remaining()
}
