import type { Page } from 'playwright'
import type { BrowserEngine } from '../types'
import type { RegistryWebProfile } from './profiles'
import { renderRegistryProfile } from './profiles'

export function registryBidiProfiles(engine: BrowserEngine, profiles: readonly RegistryWebProfile[]) {
  // Juggler 在 headless Firefox 注册 UA !important 隐藏滚动条；这三例需用同版原生 BiDi。
  return engine === 'firefox' ? profiles.filter(profile => /^scrollbar-(?:auto|none|thin)$/.test(profile.candidate)) : []
}

export function registryBidiOptions(executablePath: string) {
  return { headless: true, channel: 'moz-firefox', executablePath } as const
}

export async function registryFrames(page: Page, batch: readonly RegistryWebProfile[], referenceCss: string, productCss: string) {
  await page.setContent(`<!doctype html><html><body style="margin:0;display:flex;align-items:start"><iframe name="baseline" style="border:0;width:320px;height:${batch.length * 240}px;flex:none"></iframe><iframe name="reference" style="border:0;width:320px;height:${batch.length * 240}px;flex:none"></iframe><iframe name="product" style="border:0;width:320px;height:${batch.length * 240}px;flex:none"></iframe></body></html>`)
  // BiDi 的 frame tree 不提供 iframe.name；由真实宿主节点解析所属 context。
  const frames = await Promise.all(['baseline', 'reference', 'product'].map(async (name) => {
    const element = await page.locator(`iframe[name="${name}"]`).elementHandle()
    try {
      const frame = await element?.contentFrame()
      if (!frame) {
        throw new Error(`注册 utility 的 ${name} iframe 尚未建立可访问的浏览上下文`)
      }
      return frame
    }
    finally {
      await element?.dispose()
    }
  }))
  for (const [index, frame] of frames.entries()) {
    const css = index === 2 ? productCss : referenceCss
    const body = batch.map(profile => renderRegistryProfile(profile, index === 0)).join('\n')
    await frame!.setContent(`<!doctype html><html lang="en"><head><meta charset="UTF-8"><base href="http://tailwind-registry.invalid/"><style>${css}</style></head><body>${body}</body></html>`)
  }
  return frames
}
