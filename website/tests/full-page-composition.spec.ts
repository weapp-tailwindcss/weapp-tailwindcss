import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { createCaptureBudget } from './helpers/full-page/capture'
import { startCaptureMonitor, validCaptureWindow } from './helpers/full-page/monitor'

test.use({ headless: true, viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 })

async function fixture(page: Page) {
  await page.setContent(`<style>
    body{margin:0;height:3000px}.navbar{position:fixed;top:0;height:63px}
    #paint{position:fixed;top:80px;right:10px;opacity:.9;filter:contrast(.95);isolation:isolate}
    .toc-highlight{color:rgb(20,100,240);visibility:visible}
    #first{position:absolute;top:200px;height:30px;margin:0}
    #paint.changed{opacity:.3;filter:blur(2px)}
    </style><nav class="navbar">nav</nav><h2 class="anchor" id="first">first</h2>
    <div id="paint"><ul class="table-of-contents"><li>
      <a class="toc-highlight table-of-contents__link table-of-contents__link--active" href="#first">first</a>
    </li></ul></div>`)
  await page.evaluate(async () => {
    await document.fonts.ready
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
  })
}

async function ownStyle(page: Page) {
  return page.locator('.toc-highlight').evaluate((node) => {
    const style = getComputedStyle(node)
    const rect = node.getBoundingClientRect()
    return [style.color, style.opacity, style.visibility, rect.x, rect.y, rect.width, rect.height]
  })
}

test('stable ancestor compositing is valid without changing production paint state', async ({ page }) => {
  await fixture(page)
  const before = await page.locator('#paint').getAttribute('style')
  const monitor = await startCaptureMonitor(page, createCaptureBudget(5000))
  try {
    await monitor.settle()
    expect(validCaptureWindow(await monitor.finish())).toBe(true)
  }
  finally {
    await monitor.close()
  }
  expect(await page.locator('#paint').getAttribute('style')).toBe(before)
})

for (const property of ['opacity', 'filter', 'visibility', 'clip-path', 'mix-blend-mode', 'display'] as const) {
  test(`rejects ancestor ${property} after the final link style and geometry recover`, async ({ page }) => {
    await fixture(page)
    const before = await ownStyle(page)
    const monitor = await startCaptureMonitor(page, createCaptureBudget(5000))
    try {
      await page.locator('#paint').evaluate(async (node, property) => {
        const values = { opacity: '.3', filter: 'blur(2px)', visibility: 'hidden', 'clip-path': 'inset(50%)', 'mix-blend-mode': 'multiply', display: 'none' }
        const element = node as HTMLElement
        element.style.setProperty(property, values[property])
        await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
        element.style.removeProperty(property)
      }, property)
      await monitor.settle()
      expect(await ownStyle(page)).toEqual(before)
      const evidence = await monitor.finish()
      expect(validCaptureWindow(evidence)).toBe(false)
      expect(evidence.disturbances).toContain('捕获期间 TOC 祖先属性发生改变')
    }
    finally {
      await monitor.close()
    }
  })
}

for (const mode of ['class-return', 'style-return', 'attribute-return', 'cssom-return', 'animation-return', 'parent-return', 'detach-return'] as const) {
  test(`rejects ancestor ${mode} without relying on a native screenshot or a surviving final change`, async ({ page }) => {
    await fixture(page)
    const before = await ownStyle(page)
    const monitor = await startCaptureMonitor(page, createCaptureBudget(5000))
    try {
      await page.locator('#paint').evaluate(async (node, mode) => {
        const element = node as HTMLElement
        if (mode === 'class-return') {
          element.classList.add('changed')
          element.classList.remove('changed')
        }
        else if (mode === 'style-return') {
          element.style.opacity = '.3'
          element.style.removeProperty('opacity')
        }
        else if (mode === 'attribute-return') {
          element.setAttribute('hidden', '')
          element.removeAttribute('hidden')
        }
        else if (mode === 'cssom-return') {
          const sheet = document.styleSheets[0]!
          const index = sheet.insertRule('#paint{filter:blur(2px)}', sheet.cssRules.length)
          await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
          sheet.deleteRule(index)
        }
        else if (mode === 'parent-return') {
          const wrapper = document.createElement('div')
          element.before(wrapper)
          wrapper.append(element)
          await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
          wrapper.replaceWith(element)
        }
        else if (mode === 'detach-return') {
          const parent = element.parentNode!
          const next = element.nextSibling
          element.remove()
          await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
          parent.insertBefore(element, next)
        }
        else {
          const animation = element.animate([{ opacity: '.9' }, { opacity: '.3' }], { duration: 60_000 })
          await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
          animation.cancel()
        }
      }, mode)
      await monitor.settle()
      expect(await ownStyle(page)).toEqual(before)
      const evidence = await monitor.finish()
      expect(validCaptureWindow(evidence)).toBe(false)
      if (mode === 'cssom-return') {
        expect(evidence.disturbances).toContain('捕获期间 TOC 祖先身份、合成属性或父关系改变')
      }
      if (mode === 'animation-return') {
        expect(evidence.disturbances).toContain('TOC 祖先捕获期间存在未完成动画')
      }
    }
    finally {
      await monitor.close()
    }
  })
}

test('an ancestor animation already running when the monitor starts cannot be hidden by later cancellation', async ({ page }) => {
  await fixture(page)
  await page.locator('#paint').evaluate((node) => {
    node.animate([{ filter: 'contrast(.95)' }, { filter: 'blur(2px)' }], { duration: 60_000 })
  })
  const monitor = await startCaptureMonitor(page, createCaptureBudget(5000))
  try {
    await monitor.settle()
    await page.locator('#paint').evaluate(node => node.getAnimations().forEach(animation => animation.cancel()))
    const evidence = await monitor.finish()
    expect(validCaptureWindow(evidence)).toBe(false)
    expect(evidence.disturbances).toContain('TOC 祖先捕获期间存在未完成动画')
  }
  finally {
    await monitor.close()
  }
})

test('CSSOM can move an ancestor clip reference box while fixed child geometry and computed paint remain unchanged', async ({ page }) => {
  await page.setContent(`<style>
    body{margin:0;height:3000px}.navbar{position:fixed;top:0;height:63px}
    #spacer{height:0}#clip{width:1280px;height:300px;clip-path:inset(0)}
    .table-of-contents{position:fixed;top:80px;right:10px}.toc-highlight{color:rgb(20,100,240)}
    #first{position:absolute;top:200px;height:30px;margin:0}
    </style><nav class="navbar">nav</nav><h2 class="anchor" id="first">first</h2>
    <div id="spacer"></div><div id="clip"><ul class="table-of-contents"><li>
      <a class="toc-highlight table-of-contents__link table-of-contents__link--active" href="#first">first</a>
    </li></ul></div>`)
  const before = await ownStyle(page)
  const geometry = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.scrollHeight])
  const monitor = await startCaptureMonitor(page, createCaptureBudget(5000))
  try {
    const unchanged = await page.evaluate(async () => {
      const node = document.querySelector('#clip')!
      const properties = () => {
        const style = getComputedStyle(node)
        return Array.from(style, name => [name, style.getPropertyValue(name)])
      }
      const linkState = () => {
        const link = document.querySelector('.toc-highlight')!
        const style = getComputedStyle(link)
        const rect = link.getBoundingClientRect()
        return [style.color, style.opacity, style.visibility, rect.x, rect.y, rect.width, rect.height]
      }
      const documentGeometry = () => [document.documentElement.scrollWidth, document.documentElement.scrollHeight]
      const before = properties()
      const linkBefore = linkState()
      const geometryBefore = documentGeometry()
      const rect = node.getBoundingClientRect()
      const sheet = document.styleSheets[0]!
      const index = sheet.insertRule('#spacer{height:120px}', sheet.cssRules.length)
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
      const sameProperties = JSON.stringify(properties()) === JSON.stringify(before)
      const moved = node.getBoundingClientRect().y !== rect.y
      const linkStateSame = JSON.stringify(linkState()) === JSON.stringify(linkBefore)
      const geometrySameDuring = JSON.stringify(documentGeometry()) === JSON.stringify(geometryBefore)
      sheet.deleteRule(index)
      return { sameProperties, moved, linkStateSame, geometrySameDuring }
    })
    expect(unchanged).toEqual({ sameProperties: true, moved: true, linkStateSame: true, geometrySameDuring: true })
    await monitor.settle()
    expect(await ownStyle(page)).toEqual(before)
    expect(await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.scrollHeight])).toEqual(geometry)
    const evidence = await monitor.finish()
    expect(validCaptureWindow(evidence)).toBe(false)
    expect(evidence.disturbances).toContain('捕获期间 TOC 祖先身份、合成属性或父关系改变')
  }
  finally {
    await monitor.close()
  }
})
