import type { Page } from '@playwright/test'
import type { CaptureBudget } from './capture'
import { randomUUID } from 'node:crypto'
import { createCaptureBudget } from './capture'

interface PreparationState {
  cancelled: boolean
  cancelPending?: () => void
  window: { x: number, y: number }
  elements: { element: HTMLElement, x: number, y: number }[]
}

/** 对普通 document 的图片真实滚动、解码，结束后核对原滚动状态；不覆盖 iframe/shadow 内容。 */
export async function prepareFullPageImages(page: Page, budget: CaptureBudget) {
  const key = `weapp-full-page-images:${randomUUID()}`
  let failure: unknown
  try {
    await budget.run(() => page.evaluate(async (key) => {
      const findPending = () => [...document.images].filter(image => image.getClientRects().length > 0
        && getComputedStyle(image).visibility === 'visible'
        && (!image.complete || image.naturalWidth === 0))
      let pending = findPending()
      if (!pending.length) {
        return
      }
      const symbol = Symbol.for(key)
      const state: PreparationState = {
        cancelled: false,
        window: { x: scrollX, y: scrollY },
        elements: [...document.querySelectorAll<HTMLElement>('*')]
          .filter(element => element.scrollHeight > element.clientHeight || element.scrollWidth > element.clientWidth)
          .map(element => ({ element, x: element.scrollLeft, y: element.scrollTop })),
      }
      Reflect.set(window, symbol, state)
      for (;;) {
        // 每轮固定真实节点身份；前图的 load 可以删除或插入兄弟，不能用旧 nth 索引。
        if (state.cancelled || !pending.length) {
          return
        }
        for (const image of pending) {
          if (state.cancelled) {
            return
          }
          if (!image.isConnected) {
            continue
          }
          const loaded = new Promise<void>((resolve, reject) => {
            const listeners = new AbortController()
            const finish = (error?: Error) => {
              listeners.abort()
              state.cancelPending = undefined
              if (error) {
                reject(error)
              }
              else {
                resolve()
              }
            }
            const imageError = () => new Error(`整页截图图片加载失败：${image.currentSrc || image.src}`)
            state.cancelPending = () => finish(new Error('整页截图图片准备已取消'))
            image.addEventListener('load', () => finish(), { once: true, signal: listeners.signal })
            image.addEventListener('error', () => finish(imageError()), { once: true, signal: listeners.signal })
            if (image.complete) {
              if (image.naturalWidth > 0) {
                finish()
              }
              else {
                finish(imageError())
              }
            }
          })
          image.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' })
          // Firefox 尚未开始 lazy request 时直接 decode 会拒绝，须等待真实 load/error。
          await loaded
          if (state.cancelled) {
            return
          }
          if (!image.isConnected) {
            continue
          }
          try {
            await image.decode()
          }
          catch (error) {
            throw new Error(`整页截图图片解码失败：${image.currentSrc || image.src}；${String(error)}`)
          }
          if (image.naturalWidth <= 0) {
            throw new Error(`整页截图图片缺少有效像素：${image.currentSrc || image.src}`)
          }
        }
        pending = findPending()
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
      try {
        for (const { element, x, y } of state.elements) {
          if (element.isConnected) {
            element.scrollTo({ left: x, top: y, behavior: 'instant' })
          }
        }
        scrollTo({ left: state.window.x, top: state.window.y, behavior: 'instant' })
        await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
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
