import type { Page } from '@playwright/test'
import type { CaptureEvidence } from '../observed-sample'

export const policy = { hideOnScroll: false, minHeadingLevel: 2, maxHeadingLevel: 3 }
export const active = 'table-of-contents__link--active'

/** 原生与分片合同使用同一份真实 TOC、祖先、视口和底部像素夹具。 */
export async function fixture(page: Page) {
  await page.setContent(`<style>
    body{margin:0;height:3000px;background:linear-gradient(red,blue)}
    .navbar{position:fixed;top:0;height:63px}
    .table-of-contents{position:fixed;top:80px;right:10px}
    .toc-highlight{color:rgb(220,220,220);transition:color 200ms}
    .${active}{color:rgb(20,100,240)}
    #first{position:absolute;top:200px;height:30px;margin:0}
    #bottom{position:absolute;top:2980px;left:20px;width:20px;height:20px;background:lime}
    </style><nav class="navbar">nav</nav><h2 class="anchor" id="first">first</h2>
    <ul class="table-of-contents"><li><a class="toc-highlight table-of-contents__link ${active}" href="#first">first</a></li></ul>
    <div id="bottom"></div>`)
  await page.evaluate(async () => {
    await document.fonts.ready
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
  })
}

export function observation(): CaptureEvidence {
  return { window: null, before: null, after: null }
}

export function ownedMonitors(page: Page) {
  return page.evaluate(() => Object.getOwnPropertySymbols(window).filter(symbol => symbol.description?.startsWith('weapp-full-page-monitor:')).length)
}
