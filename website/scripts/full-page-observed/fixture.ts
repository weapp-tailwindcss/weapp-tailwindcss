import type { Page } from '@playwright/test'
import type { CaptureWindow } from '../../tests/helpers/full-page/monitor'
import type { TocObservation } from '../../tests/helpers/full-page/toc/model'
import { EventEmitter } from 'node:events'
import { PNG } from 'pngjs'
import { vi } from 'vitest'

type ScreenshotOptions = NonNullable<Parameters<Page['screenshot']>[0]>

export const policy = { hideOnScroll: false, minHeadingLevel: 2, maxHeadingLevel: 3 }

/** 只替换浏览器传输；保留真实分片合成、TOC 判断、采样生命周期和稳定配对。 */
export function observedFixture() {
  const mainFrame = {}
  const geometry = { width: 4, height: 6, viewportWidth: 4, viewportHeight: 3, scrollX: 0, scrollY: 0, deviceScaleFactor: 1, url: 'https://capture.fixture/' }
  const state = {
    fingerprint: 'same-composition',
    heading: 'first',
    events: [] as string[],
    monitors: [] as ReturnType<typeof start>[],
    screenshots: [] as ScreenshotOptions[],
    onStart: undefined as (() => void) | undefined,
    onScreenshot: undefined as ((monitor: ReturnType<typeof start>) => void | Promise<void>) | undefined,
    onGap: undefined as (() => void) | undefined,
  }
  function start() {
    state.onStart?.()
    state.events.push('start')
    const evidence: CaptureWindow = {
      initialized: true,
      completed: true,
      frames: 2,
      events: 0,
      overflow: false,
      disturbances: [],
      geometry,
      fingerprint: state.fingerprint,
    }
    const monitor = {
      evidence,
      settle: vi.fn(async () => { state.events.push('settle') }),
      finish: vi.fn(async () => {
        state.events.push('finish')
        return evidence
      }),
      close: vi.fn(async () => { state.events.push('close') }),
    }
    state.monitors.push(monitor)
    return monitor
  }
  const page = Object.assign(new EventEmitter(), {
    mainFrame: () => mainFrame,
    async evaluate(fn: () => unknown) {
      const source = fn.toString()
      if (source.includes('const body = document.body')) {
        state.events.push('geometry')
        return geometry
      }
      if (source.includes('requestAnimationFrame')) {
        state.onGap?.()
        return
      }
      throw new Error(`测试未声明的浏览器传输：${source}`)
    },
    async screenshot(options: ScreenshotOptions) {
      state.events.push('screenshot')
      state.screenshots.push(options)
      await state.onScreenshot?.(state.monitors.at(-1)!)
      const clip = options.clip ?? { x: 0, y: 0, ...geometry }
      const image = new PNG({ width: clip.width, height: clip.height })
      for (let y = 0; y < image.height; y += 1) {
        for (let x = 0; x < image.width; x += 1) {
          const offset = (y * image.width + x) * 4
          image.data.set([x + clip.x, y + clip.y, 80, 255], offset)
        }
      }
      return PNG.sync.write(image)
    },
  })
  return {
    state,
    start,
    page: page as unknown as Page,
    reload: () => page.emit('framenavigated', mainFrame),
    listenerCount: () => page.eventNames().length,
    observe(): TocObservation {
      state.events.push('toc')
      return {
        url: geometry.url,
        viewportHeight: 720,
        ...policy,
        navbarHeight: 63,
        links: [{ href: `#${state.heading}`, targetId: state.heading, active: true }],
        headings: [{ id: state.heading, top: 200, bottom: 230 }],
        issues: [],
      }
    },
  }
}
