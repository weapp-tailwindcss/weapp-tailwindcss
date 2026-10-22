import { Buffer } from 'node:buffer'
import { createServer } from 'node:http'
import { expect } from '@playwright/test'
import { PNG } from 'pngjs'
import { useFrozenGifImages } from './helpers/frozen-gif'
import { createCaptureBudget } from './helpers/full-page/capture'
import { prepareFullPageImages } from './helpers/full-page/images'
import { visualTest as test } from './helpers/visual-test'

// 两帧独立夹具：首帧 100ms，第二帧蓝色 1400ms，无限循环。
const redGif = 'R0lGODlhEAAQAIEAAP8AAAAAAAAAAAAAACH/C05FVFNDQVBFMi4wAwEAAAAh+QQACgAAACwAAAAAEAAQAAAIHQABCBxIsKDBgwgTKlzIsKHDhxAjSpxIsaLFgQEBACH5BAGMAAEALAAAAAAQABAAgQAA/wAAAAAAAAAAAAgdAAEIHEiwoMGDCBMqXMiwocOHECNKnEixosWBAQEAOw=='
const greenGif = 'R0lGODlhEAAQAIEAAAD/AAAAAAAAAAAAACH/C05FVFNDQVBFMi4wAwEAAAAh+QQACgAAACwAAAAAEAAQAAAIHQABCBxIsKDBgwgTKlzIsKHDhxAjSpxIsaLFgQEBACH5BAGMAAEALAAAAAAQABAAgQAA/wAAAAAAAAAAAAgdAAEIHEiwoMGDCBMqXMiwocOHECNKnEixosWBAQEAOw=='

async function imageFixture() {
  const requests: string[] = []
  const png = new PNG({ width: 16, height: 16 })
  for (let offset = 0; offset < png.data.length; offset += 4) {
    png.data.set([255, 255, 0, 255], offset)
  }
  const yellow = PNG.sync.write(png)
  const server = createServer((request, response) => {
    const pathname = new URL(request.url ?? '/', 'http://fixture.test').pathname
    requests.push(pathname)
    if (pathname === '/red.gif' || pathname === '/green.gif') {
      response.writeHead(200, { 'Content-Type': 'image/gif', 'Cache-Control': 'no-store' })
      response.end(Buffer.from(pathname === '/red.gif' ? redGif : greenGif, 'base64'))
    }
    else if (pathname === '/yellow.png') {
      response.writeHead(200, { 'Content-Type': 'image/png' })
      response.end(yellow)
    }
    else if (pathname === '/missing.gif') {
      response.writeHead(404, { 'Content-Type': 'image/gif' })
      response.end('missing image')
    }
    else if (pathname === '/corrupt.gif') {
      response.writeHead(200, { 'Content-Type': 'image/gif' })
      response.end('GIF89a invalid data')
    }
    else if (pathname === '/redirect-to-animation') {
      response.writeHead(302, { 'Location': '/extensionless?source=redirect', 'Content-Type': 'image/gif' })
      response.end()
    }
    else if (pathname === '/redirect.png') {
      response.writeHead(302, { Location: '/yellow.png' })
      response.end()
    }
    else if (pathname === '/extensionless') {
      response.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Cross-Origin-Resource-Policy': 'same-origin' })
      response.end(Buffer.from(greenGif, 'base64'))
    }
    else {
      response.writeHead(200, { 'Content-Type': 'text/html' })
      response.end(`<!doctype html><style>body{margin:0}img{display:block;width:16px;height:16px}</style><img src="${pathname === '/corrupt' ? '/corrupt.gif' : '/red.gif'}">`)
    }
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  if (!address || typeof address === 'string') {
    throw new Error('图片夹具未取得 TCP 端口')
  }
  return {
    url: `http://127.0.0.1:${address.port}`,
    requests,
    yellow,
    async dispose() {
      await new Promise<void>((resolve, reject) => {
        server.close(error => error ? reject(error) : resolve())
        server.closeAllConnections()
      })
    },
  }
}

function firstPixel(buffer: Buffer) {
  const image = PNG.sync.read(buffer)
  return [...image.data.subarray(0, 4)]
}

test('visual GIFs retain the first source frame across animation phases and source changes', async ({ page }) => {
  const fixture = await imageFixture()
  try {
    await page.goto(fixture.url)
    const image = page.locator('img')
    await image.evaluate(node => (node as HTMLImageElement).decode())
    expect(firstPixel(await image.screenshot())).toEqual([255, 0, 0, 255])
    // 有意跨过 GIF 的首帧时长，验证媒体时钟而不是等待页面就绪。
    await page.waitForTimeout(400)
    expect(firstPixel(await image.screenshot())).toEqual([255, 0, 0, 255])
    await image.evaluate((node) => {
      const image = node as HTMLImageElement
      image.src = '/green.gif'
    })
    await image.evaluate(node => (node as HTMLImageElement).decode())
    await page.waitForTimeout(400)
    expect(firstPixel(await image.screenshot())).toEqual([0, 255, 0, 255])
    expect(await image.evaluate(node => [(node as HTMLImageElement).naturalWidth, (node as HTMLImageElement).naturalHeight])).toEqual([16, 16])
    expect(fixture.requests.filter(pathname => pathname === '/red.gif')).toHaveLength(1)
    expect(fixture.requests.filter(pathname => pathname === '/green.gif')).toHaveLength(1)
  }
  finally {
    await fixture.dispose()
  }
})

test('visual image freezing preserves static bytes and failed HTTP image status', async ({ page }) => {
  const fixture = await imageFixture()
  try {
    await page.goto(fixture.url)
    const image = page.locator('img')
    const yellow = page.waitForResponse(`${fixture.url}/yellow.png`)
    await image.evaluate((node) => {
      const image = node as HTMLImageElement
      image.src = '/yellow.png'
    })
    expect(await (await yellow).body()).toEqual(fixture.yellow)
    await image.evaluate(node => (node as HTMLImageElement).decode())
    expect(firstPixel(await image.screenshot())).toEqual([255, 255, 0, 255])
    const missing = page.waitForResponse(`${fixture.url}/missing.gif`)
    await image.evaluate((node) => {
      const image = node as HTMLImageElement
      image.src = '/missing.gif'
    })
    expect((await missing).status()).toBe(404)
    await expect(prepareFullPageImages(page, createCaptureBudget(5000))).rejects.toThrow('图片加载失败')
    expect(fixture.requests.filter(pathname => pathname === '/yellow.png')).toHaveLength(1)
    expect(fixture.requests.filter(pathname => pathname === '/missing.gif')).toHaveLength(1)
  }
  finally {
    await fixture.dispose()
  }
})

test('a successful HTTP response containing a corrupt GIF rejects the visual run', async ({ browser }, info) => {
  const fixture = await imageFixture()
  const context = await browser.newContext()
  try {
    await expect(useFrozenGifImages(context, async (context) => {
      const page = await context.newPage()
      await page.goto(`${fixture.url}/corrupt`)
      expect(await page.locator('img').evaluate(node => (node as HTMLImageElement).naturalWidth)).toBe(0)
    }, info)).rejects.toThrow(`视觉图片响应失败：${fixture.url}/corrupt.gif`)
    expect(fixture.requests.filter(pathname => pathname === '/corrupt.gif')).toHaveLength(1)
  }
  finally {
    try {
      await context.close()
    }
    finally {
      await fixture.dispose()
    }
  }
})

test('GIF bytes without a GIF URL or MIME reject visual capture', async ({ browser }, info) => {
  const fixture = await imageFixture()
  const context = await browser.newContext()
  try {
    await expect(useFrozenGifImages(context, async (context) => {
      const page = await context.newPage()
      await page.goto(fixture.url)
      const destination = page.waitForResponse(`${fixture.url}/extensionless?source=direct`)
      await page.locator('img').evaluate((node) => {
        (node as HTMLImageElement).src = '/extensionless?source=direct'
      })
      const final = await destination
      expect(final.headers()['cross-origin-resource-policy']).toBe('same-origin')
      expect(final.headers()['content-type']).toBe('application/octet-stream')
      await page.locator('img').evaluate(node => (node as HTMLImageElement).decode())
    }, info)).rejects.toThrow(`视觉图片字节验证失败：${fixture.url}/extensionless?source=direct`)
    expect(fixture.requests.filter(pathname => pathname === '/extensionless')).toHaveLength(1)
  }
  finally {
    try {
      await context.close()
    }
    finally {
      await fixture.dispose()
    }
  }
})

test('visual image routing preserves real HTTP redirects to static images', async ({ page }) => {
  const fixture = await imageFixture()
  try {
    await page.goto(fixture.url)
    const destination = page.waitForResponse(`${fixture.url}/yellow.png`)
    await page.locator('img').evaluate((node) => {
      (node as HTMLImageElement).src = '/redirect.png'
    })
    const final = await destination
    expect(final.request().redirectedFrom()?.url()).toBe(`${fixture.url}/redirect.png`)
    expect(await final.body()).toEqual(fixture.yellow)
    await page.locator('img').evaluate(node => (node as HTMLImageElement).decode())
    expect(firstPixel(await page.locator('img').screenshot())).toEqual([255, 255, 0, 255])
    expect(fixture.requests.filter(pathname => pathname === '/redirect.png')).toHaveLength(1)
    expect(fixture.requests.filter(pathname => pathname === '/yellow.png')).toHaveLength(1)
  }
  finally {
    await fixture.dispose()
  }
})

test('redirected GIFs reject visual capture instead of accepting an uncontrolled animation phase', async ({ browser }, info) => {
  const fixture = await imageFixture()
  const context = await browser.newContext()
  try {
    await expect(useFrozenGifImages(context, async (context) => {
      const page = await context.newPage()
      await page.goto(fixture.url)
      const destination = page.waitForResponse(`${fixture.url}/extensionless?source=redirect`)
      await page.locator('img').evaluate((node) => {
        (node as HTMLImageElement).src = '/redirect-to-animation'
      })
      await destination
      await page.locator('img').evaluate(node => (node as HTMLImageElement).decode())
    }, info)).rejects.toThrow(`视觉图片字节验证失败：${fixture.url}/extensionless?source=redirect`)
    expect(fixture.requests.filter(pathname => pathname === '/redirect-to-animation')).toHaveLength(1)
    expect(fixture.requests.filter(pathname => pathname === '/extensionless')).toHaveLength(1)
  }
  finally {
    try {
      await context.close()
    }
    finally {
      await fixture.dispose()
    }
  }
})

test('visual teardown retains the original assertion and GIF decode errors together', async ({ browser }, info) => {
  const fixture = await imageFixture()
  const context = await browser.newContext()
  const original = new Error('独立断言失败')
  try {
    const failure = await useFrozenGifImages(context, async (context) => {
      const page = await context.newPage()
      await page.goto(`${fixture.url}/corrupt`)
      throw original
    }, info).then(() => undefined, (error: unknown) => error)
    expect(failure).toBeInstanceOf(AggregateError)
    const combined = failure as AggregateError
    expect(combined.errors[0]).toBe(original)
    expect(combined.errors[1]).toBeInstanceOf(AggregateError)
    expect((combined.errors[1] as AggregateError).message).toContain(`${fixture.url}/corrupt.gif`)
  }
  finally {
    try {
      await context.close()
    }
    finally {
      await fixture.dispose()
    }
  }
})
