import type { BrowserContext, Response, Route, TestInfo } from '@playwright/test'
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import sharp from 'sharp'
import { runWithCleanup } from '../../../scripts/e2e-preflight/cleanup'

/** 视觉合同仅比较网络 GIF 的真实首帧，不把动画相位纳入黄金图。 */
export async function useFrozenGifImages(context: BrowserContext, use: (context: BrowserContext) => Promise<void>, info: TestInfo) {
  const records: Array<{ url: string, sourceSha256: string, frame: number, width: number, height: number, pngSha256: string }> = []
  const errors: Error[] = []
  const inspections: Promise<void>[] = []
  const gifUrl = /\.gif(?:[?#]|$)/i
  const digest = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex')
  const isGif = (source: Buffer, headers: Record<string, string>) => /^image\/gif(?:\s*;|$)/i.test(headers['content-type'] ?? '') || ['GIF87a', 'GIF89a'].includes(source.subarray(0, 6).toString('ascii'))
  const inspectImage = async (response: Response) => {
    if (response.request().resourceType() !== 'image' || !response.ok()) {
      return
    }
    try {
      if (isGif(await response.body(), response.headers())) {
        throw new Error(`GIF 未经过首帧规范化，禁止接受动画相位：${response.url()}`)
      }
    }
    catch (cause) {
      errors.push(new Error(`视觉图片字节验证失败：${response.url()}`, { cause }))
    }
  }
  const onResponse = (response: Response) => {
    inspections.push(inspectImage(response))
  }
  const respond = async (route: Route) => {
    if (route.request().resourceType() !== 'image') {
      await route.fallback()
      return
    }
    const response = await route.fetch({ maxRetries: 0, maxRedirects: 0, timeout: 30_000 })
    await runWithCleanup(async () => {
      if (response.status() >= 300 && response.status() < 400) {
        throw new Error('GIF 地址返回重定向，禁止改写真实 HTTP 链')
      }
      if (!response.ok()) {
        await route.fulfill({ response })
        return
      }
      const source = await response.body()
      if (!isGif(source, response.headers())) {
        await route.fulfill({ response })
        return
      }
      const { data, info: image } = await sharp(source, { page: 0, pages: 1, animated: false }).png().toBuffer({ resolveWithObject: true })
      const headers: Record<string, string> = { ...response.headers(), 'content-type': 'image/png', 'cache-control': 'no-store' }
      for (const header of ['content-length', 'content-encoding', 'etag', 'last-modified', 'content-md5', 'digest', 'content-range', 'accept-ranges']) {
        delete headers[header]
      }
      records.push({ url: route.request().url(), sourceSha256: digest(source), frame: 0, width: image.width, height: image.height, pngSha256: digest(data) })
      await route.fulfill({ response, headers, body: data })
    }, () => response.dispose())
  }
  const handler = async (route: Route) => {
    try {
      await respond(route)
    }
    catch (cause) {
      errors.push(new Error(`视觉图片响应失败：${route.request().url()}`, { cause }))
      try {
        await route.abort('failed')
      }
      catch (cause) {
        errors.push(new Error('视觉图片请求中止失败', { cause }))
      }
    }
  }
  // 仅选择显式 GIF 地址；其余图片保留原始请求，并由最终字节检查拒绝漏网 GIF。
  await context.route(gifUrl, handler)
  context.on('response', onResponse)
  await runWithCleanup(() => use(context), async () => {
    // 整个 context 属于本例；等待在途响应结束，不能留下迟到转换。
    await runWithCleanup(async () => {
      await runWithCleanup(() => context.unrouteAll({ behavior: 'wait' }), async () => {
        context.off('response', onResponse)
        await Promise.all(inspections)
      })
    }, async () => {
      await runWithCleanup(async () => {
        if (records.length) {
          await info.attach('visual-gif-first-frames', {
            body: Buffer.from(JSON.stringify({ policy: 'network-gif-first-frame/v1', decoder: { sharp: sharp.versions.sharp, vips: sharp.versions.vips }, images: records })),
            contentType: 'application/json',
          })
        }
      }, () => {
        if (errors.length) {
          throw new AggregateError(errors, `视觉图片响应失败：${errors.map(error => error.message).join('；')}`)
        }
      })
    })
  })
}
