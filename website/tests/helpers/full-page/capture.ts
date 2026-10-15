import type { Page } from '@playwright/test'
import type { Buffer } from 'node:buffer'
import { PNG } from 'pngjs'

export interface CaptureBudget {
  remaining: () => number
  run: <T>(operation: (remaining: number) => Promise<T>) => Promise<T>
}

/** 所有分片、重采和编码共享同一截止时间，不能逐片重新领取预算。 */
export function createCaptureBudget(timeout: number): CaptureBudget {
  if (!Number.isFinite(timeout) || timeout <= 0) {
    throw new Error('整页截图共享预算必须是正数')
  }
  const deadline = performance.now() + Math.min(timeout, 60_000)
  const remaining = () => {
    const value = deadline - performance.now()
    if (value <= 0) {
      throw new Error('整页截图共享预算已耗尽')
    }
    return Math.ceil(value)
  }
  return {
    remaining,
    async run(operation) {
      const timeout = remaining()
      let timer: ReturnType<typeof setTimeout> | undefined
      try {
        const result = await Promise.race([
          operation(timeout),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new Error('整页截图共享预算已耗尽')), timeout)
          }),
        ])
        remaining()
        return result
      }
      finally {
        clearTimeout(timer)
      }
    },
  }
}

/** 与 Playwright fullPage 使用相同的文档尺寸，同时观测不能由捕获改变的几何状态。 */
export function readDocumentGeometry(page: Page) {
  return page.evaluate(() => {
    const body = document.body
    const html = document.documentElement
    if (!body || !html) {
      throw new Error('整页截图缺少文档根节点')
    }
    return {
      width: Math.max(body.scrollWidth, html.scrollWidth, body.offsetWidth, html.offsetWidth, body.clientWidth, html.clientWidth),
      height: Math.max(body.scrollHeight, html.scrollHeight, body.offsetHeight, html.offsetHeight, body.clientHeight, html.clientHeight),
      viewportWidth: innerWidth,
      viewportHeight: innerHeight,
      scrollX,
      scrollY,
      deviceScaleFactor: devicePixelRatio,
      url: location.href,
    }
  })
}

function sameGeometry(first: Awaited<ReturnType<typeof readDocumentGeometry>>, second: Awaited<ReturnType<typeof readDocumentGeometry>>) {
  return JSON.stringify(first) === JSON.stringify(second)
}

/** 按文档坐标完整覆盖二维像素，不滚动、不改视口，逐片复制后即可释放解码数据。 */
export async function captureFullPageSample(page: Page, budget: CaptureBudget, tileSize = 16_000) {
  if (!Number.isSafeInteger(tileSize) || tileSize <= 0 || tileSize > 16_000) {
    throw new Error('整页截图分片尺寸必须是 1 到 16000 的整数')
  }
  const before = await budget.run(() => readDocumentGeometry(page))
  const image = new PNG({ width: before.width, height: before.height })
  for (let y = 0; y < before.height; y += tileSize) {
    for (let x = 0; x < before.width; x += tileSize) {
      const clip = { x, y, width: Math.min(tileSize, before.width - x), height: Math.min(tileSize, before.height - y) }
      let buffer: Buffer
      try {
        buffer = await budget.run(timeout => page.screenshot({
          fullPage: true,
          clip,
          animations: 'disabled',
          caret: 'hide',
          scale: 'css',
          type: 'png',
          timeout,
        }))
      }
      catch (error) {
        try {
          const after = await budget.run(() => readDocumentGeometry(page))
          if (!sameGeometry(before, after)) {
            return undefined
          }
        }
        catch {
          // 复核失败时保留截图首错；共享截止时间耗尽则优先报告预算错误。
          budget.remaining()
        }
        throw error
      }
      const tile = PNG.sync.read(buffer)
      if (tile.width !== clip.width || tile.height !== clip.height) {
        const after = await budget.run(() => readDocumentGeometry(page))
        if (!sameGeometry(before, after)) {
          return undefined
        }
        throw new Error(`整页截图分片尺寸不符：预期 ${clip.width}×${clip.height}，实际 ${tile.width}×${tile.height}`)
      }
      for (let row = 0; row < clip.height; row += 1) {
        tile.data.copy(image.data, ((y + row) * image.width + x) * 4, row * clip.width * 4, (row + 1) * clip.width * 4)
      }
      budget.remaining()
    }
  }
  const after = await budget.run(() => readDocumentGeometry(page))
  return sameGeometry(before, after) ? image : undefined
}
