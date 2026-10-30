import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { PNG } from 'pngjs'
import { createCaptureBudget } from './helpers/full-page/capture'
import { prepareFullPageImages } from './helpers/full-page/images'
import { expectFullPageScreenshot } from './helpers/full-page/screenshot'

const green = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="20"><rect width="32" height="20" fill="lime"/></svg>')}`
const blue = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="20"><rect width="32" height="20" fill="blue"/></svg>')}`

async function loadedImages(page: Page, contents = `<img id="first" src="${green}">`) {
  await page.setContent(`<style>body{margin:0}img{display:block;width:32px;height:20px}</style>${contents}`)
  await page.waitForFunction(() => [...document.images].filter(image => !image.loading || image.loading !== 'lazy').every(image => image.complete && image.naturalWidth > 0))
}

/** 真实 load/decode 后阻止 Promise 完成，以明确事件屏障验证调用方是否等待。 */
async function imageGate(page: Page) {
  let notify!: () => void
  const entered = new Promise<void>((resolve) => {
    notify = resolve
  })
  await page.exposeFunction('__imageDecodeEntered', () => notify())
  await page.evaluate(() => {
    const key = Symbol.for('weapp-image-decoding-fixture')
    const decode = HTMLImageElement.prototype.decode
    const scroll = Element.prototype.scrollIntoView
    let settle!: () => void
    const settled = new Promise<void>((resolve) => {
      settle = resolve
    })
    const state = {
      calls: [] as { id: string, src: string }[],
      scrolls: 0,
      blocked: false,
      settled,
      release: undefined as (() => void) | undefined,
      reject: undefined as (() => void) | undefined,
      restore: () => {},
    }
    HTMLImageElement.prototype.decode = function () {
      state.calls.push({ id: this.id, src: this.currentSrc || this.src })
      const result = decode.call(this)
      if (this.id !== 'first' || state.blocked) {
        return result
      }
      state.blocked = true
      return result.then(() => new Promise<void>((resolve, reject) => {
        state.release = resolve
        state.reject = () => reject(new Error('image-decoding-fixture-rejection'))
        void Reflect.get(window, '__imageDecodeEntered')()
      })).finally(settle)
    }
    Element.prototype.scrollIntoView = function (options) {
      state.scrolls += 1
      return scroll.call(this, options)
    }
    state.restore = () => {
      state.release?.()
      HTMLImageElement.prototype.decode = decode
      Element.prototype.scrollIntoView = scroll
      Reflect.deleteProperty(window, key)
    }
    Reflect.set(window, key, state)
  })
  const inspect = () => page.evaluate(() => {
    const state = Reflect.get(window, Symbol.for('weapp-image-decoding-fixture'))
    return { calls: state.calls as { id: string, src: string }[], scrolls: state.scrolls as number }
  })
  const finish = (action: 'release' | 'reject') => page.evaluate(async (action) => {
    const state = Reflect.get(window, Symbol.for('weapp-image-decoding-fixture'))
    state[action]()
    await state.settled
  }, action)
  const restore = () => page.evaluate(() => Reflect.get(window, Symbol.for('weapp-image-decoding-fixture'))?.restore())
  return { entered, inspect, finish, restore }
}

test('already complete images must finish decoding before the native screenshot', async ({ page }) => {
  await loadedImages(page)
  const gate = await imageGate(page)
  const screenshot = page.screenshot
  const evaluate = page.evaluate
  let released = false
  let captures = 0
  let preparationSettled = false
  let preparationCompleted: Promise<void> | undefined
  let outcome: Promise<unknown> | undefined
  try {
    page.evaluate = ((pageFunction: Parameters<Page['evaluate']>[0], arg?: Parameters<Page['evaluate']>[1]) => {
      const result = evaluate.call(page, pageFunction, arg)
      if (!preparationCompleted && typeof arg === 'string' && arg.startsWith('weapp-full-page-images:')) {
        preparationCompleted = result.then(() => {
          preparationSettled = true
        }, () => {
          preparationSettled = true
        })
      }
      return result
    }) as Page['evaluate']
    page.screenshot = async (options) => {
      expect(released, 'decode 屏障释放前不能截图').toBe(true)
      expect(options?.fullPage).toBe(true)
      expect(options?.clip).toBeUndefined()
      captures += 1
      const image = PNG.sync.read(await screenshot.call(page, options))
      expect([...image.data.subarray((image.width + 1) * 4, (image.width + 1) * 4 + 4)]).toEqual([0, 255, 0, 255])
      throw new Error('native-image-decoding-capture-reached')
    }
    outcome = expectFullPageScreenshot(page).then(() => null, error => error)
    expect(await Promise.race([gate.entered.then(() => 'decode'), outcome.then(() => 'capture-ended')])).toBe('decode')
    await page.evaluate(() => new Promise<void>((resolve) => {
      const channel = new MessageChannel()
      channel.port1.onmessage = () => {
        channel.port1.close()
        channel.port2.close()
        resolve()
      }
      channel.port2.postMessage(null)
    }))
    expect(preparationCompleted, 'PREPARATION_EVALUATE_OBSERVED').toBeDefined()
    expect(preparationSettled, 'PREPARATION_MUST_REMAIN_PENDING_BEFORE_DECODE_RELEASE').toBe(false)
    expect(captures).toBe(0)
    expect((await gate.inspect()).scrolls).toBe(0)
    released = true
    await gate.finish('release')
    expect(String(await outcome)).toContain('native-image-decoding-capture-reached')
    expect(captures).toBe(1)
  }
  finally {
    page.evaluate = evaluate
    try {
      await gate.restore()
      await outcome
      await preparationCompleted
    }
    finally {
      page.screenshot = screenshot
    }
  }
})

test('a complete image decode rejection rejects native capture before screenshots', async ({ page }) => {
  await loadedImages(page)
  const gate = await imageGate(page)
  const screenshot = page.screenshot
  let captures = 0
  let outcome: Promise<unknown> | undefined
  try {
    page.screenshot = async () => {
      captures += 1
      throw new Error('unexpected-screenshot-before-decode')
    }
    outcome = expectFullPageScreenshot(page).then(() => null, error => error)
    expect(await Promise.race([gate.entered.then(() => 'decode'), outcome.then(() => 'capture-ended')])).toBe('decode')
    await gate.finish('reject')
    expect(String(await outcome)).toContain('整页截图图片解码失败')
    expect(String(await outcome)).toContain('image-decoding-fixture-rejection')
    expect(captures).toBe(0)
  }
  finally {
    page.screenshot = screenshot
    await gate.restore()
    await outcome
  }
})

test('a late complete image decode cannot scroll or request another lazy image after cancellation', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 240 })
  let laterRequested = false
  await page.route('http://decoding.fixture/later.svg', (route) => {
    laterRequested = true
    return route.fulfill({ status: 404, body: 'cancelled preparation must not request this image' })
  })
  await loadedImages(page, `<img id="first" src="${green}"><div style="height:6000px"></div><img loading="lazy" src="http://decoding.fixture/later.svg">`)
  await page.evaluate(() => scrollTo(0, 23))
  const before = await page.evaluate(() => [scrollX, scrollY])
  const gate = await imageGate(page)
  const evaluate = page.evaluate
  let preparationSettled: Promise<void> | undefined
  let outcome: Promise<unknown> | undefined
  try {
    page.evaluate = ((pageFunction: Parameters<Page['evaluate']>[0], arg?: Parameters<Page['evaluate']>[1]) => {
      const result = evaluate.call(page, pageFunction, arg)
      if (!preparationSettled && typeof arg === 'string' && arg.startsWith('weapp-full-page-images:')) {
        // 首次调用是准备循环，后续同 key 的 cleanup 不替换它；原 Promise 原样返回。
        preparationSettled = result.then(() => {}, () => {})
      }
      return result
    }) as Page['evaluate']
    outcome = prepareFullPageImages(page, createCaptureBudget(1000)).then(() => null, error => error)
    expect(await Promise.race([gate.entered.then(() => 'decode'), outcome.then(() => 'preparation-ended')])).toBe('decode')
    expect(String(await outcome)).toContain('共享预算已耗尽')
    const calls = await gate.inspect()
    await gate.finish('release')
    expect(preparationSettled, '必须捕获原始准备 evaluate 的完成屏障').toBeDefined()
    await preparationSettled
    expect(await page.evaluate(() => [scrollX, scrollY])).toEqual(before)
    expect(await gate.inspect()).toEqual(calls)
    expect(laterRequested).toBe(false)
  }
  finally {
    page.evaluate = evaluate
    try {
      await gate.restore()
    }
    finally {
      await outcome
      await preparationSettled
    }
  }
})

test('complete image preparation checks external scrolling without scrolling it back', async ({ page }) => {
  await loadedImages(page, `<img id="first" src="${green}"><div style="height:2000px"></div>`)
  await page.evaluate(() => scrollTo(0, 23))
  const gate = await imageGate(page)
  const outcome = prepareFullPageImages(page, createCaptureBudget(5000)).then(() => null, error => error)
  try {
    expect(await Promise.race([gate.entered.then(() => 'decode'), outcome.then(() => 'preparation-ended')])).toBe('decode')
    await page.evaluate(() => scrollTo(0, 29))
    await gate.finish('release')
    expect(String(await outcome)).toContain('滚动恢复失败')
    expect(await page.evaluate(() => scrollY)).toBe(29)
    expect((await gate.inspect()).scrolls).toBe(0)
  }
  finally {
    await gate.restore()
    await outcome
  }
})

test('a source change during decode cannot mark the replacement resource as prepared', async ({ page }) => {
  await loadedImages(page)
  const gate = await imageGate(page)
  const outcome = prepareFullPageImages(page, createCaptureBudget(5000)).then(() => null, error => error)
  try {
    expect(await Promise.race([gate.entered.then(() => 'decode'), outcome.then(() => 'preparation-ended')])).toBe('decode')
    await page.locator('#first').evaluate((image, source) => {
      (image as HTMLImageElement).src = source
    }, blue)
    await page.waitForFunction(() => document.images[0].complete && document.images[0].naturalWidth > 0)
    await gate.finish('release')
    expect(await outcome).toBeNull()
    expect((await gate.inspect()).calls.map(call => call.src)).toEqual([green, blue])
  }
  finally {
    await gate.restore()
    await outcome
  }
})

test('a detached decoding node cannot hide a new complete sibling', async ({ page }) => {
  await loadedImages(page)
  const gate = await imageGate(page)
  const outcome = prepareFullPageImages(page, createCaptureBudget(5000)).then(() => null, error => error)
  try {
    expect(await Promise.race([gate.entered.then(() => 'decode'), outcome.then(() => 'preparation-ended')])).toBe('decode')
    await page.evaluate((source) => {
      document.querySelector('#first')!.remove()
      const image = new Image()
      image.id = 'replacement'
      image.src = source
      document.body.append(image)
    }, green)
    await page.waitForFunction(() => document.images[0].complete && document.images[0].naturalWidth > 0)
    await gate.finish('release')
    expect(await outcome).toBeNull()
    expect((await gate.inspect()).calls.map(call => call.id)).toEqual(['first', 'replacement'])
  }
  finally {
    await gate.restore()
    await outcome
  }
})

test('repeated scans decode each complete node once even when several nodes share a URL', async ({ page }) => {
  await loadedImages(page, `<img id="first" src="${green}"><img id="second" src="${green}">`)
  const gate = await imageGate(page)
  const outcome = prepareFullPageImages(page, createCaptureBudget(5000)).then(() => null, error => error)
  try {
    expect(await Promise.race([gate.entered.then(() => 'decode'), outcome.then(() => 'preparation-ended')])).toBe('decode')
    await page.evaluate((source) => {
      const image = new Image()
      image.id = 'third'
      image.src = source
      document.body.append(image)
    }, green)
    await page.waitForFunction(() => [...document.images].every(image => image.complete && image.naturalWidth > 0))
    await gate.finish('release')
    expect(await outcome).toBeNull()
    expect((await gate.inspect()).calls.map(call => call.id)).toEqual(['first', 'second', 'third'])
  }
  finally {
    await gate.restore()
    await outcome
  }
})
