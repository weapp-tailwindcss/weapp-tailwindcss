import type { Page } from 'playwright'
import type { WebLayout, WebProbe } from './probes'

export interface WebObservation {
  actual: string
  className: string | null
  attributes: Record<string, string>
  rect: { width: number, height: number, top: number, left: number }
  scroll: { x: number, y: number }
  layout?: WebLayout
}

export async function activateProbe(page: Page, probe: WebProbe): Promise<() => Promise<void>> {
  const locator = page.locator(probe.actionTarget ?? '#probe')
  if (probe.active) {
    await locator.hover()
    await page.mouse.down()
    return async () => {
      await page.mouse.up()
      await page.mouse.move(0, 0)
    }
  }
  switch (probe.action) {
    case 'hover':
      await locator.hover()
      return async () => {
        await page.mouse.move(0, 0)
      }
    case 'focus':
      await locator.focus()
      return async () => {
        await locator.blur()
      }
    case 'checked':
      await locator.check()
      return async () => {
        await locator.uncheck()
      }
    case 'dark':
      await page.emulateMedia({ colorScheme: 'dark' })
      return async () => {
        await page.emulateMedia({ colorScheme: 'light' })
      }
    case 'responsive':
      await page.setViewportSize({ width: 800, height: 480 })
      return async () => {
        await page.setViewportSize({ width: 640, height: 480 })
      }
    case 'container':
      await page.locator('#container').evaluate(element => (element as HTMLElement).style.width = '300px')
      return async () => {
        await page.locator('#container').evaluate(element => (element as HTMLElement).style.width = '100px')
      }
    case 'dynamic': {
      const attribute = probe.attribute ?? { name: 'class', value: `probe ${probe.candidate}` }
      const previous = await locator.getAttribute(attribute.name)
      await locator.evaluate((element, item) => element.setAttribute(item.name, item.value), attribute)
      return async () => {
        await locator.evaluate((element, item) => {
          if (item.previous === null) {
            element.removeAttribute(item.name)
          }
          else {
            element.setAttribute(item.name, item.previous)
          }
        }, { name: attribute.name, previous })
      }
    }
    default:
      throw new Error(`未知的运行时动作：${probe.id}/${probe.action}`)
  }
}

export async function readProbe(page: Page, probe: WebProbe): Promise<WebObservation> {
  return page.locator(probe.selector ?? '#probe').evaluate((element, { property, measureLayout }) => {
    const isBefore = property.startsWith('before:')
    const style = window.getComputedStyle(element, isBefore ? '::before' : undefined)
    const rect = element.getBoundingClientRect()
    return {
      actual: style.getPropertyValue(isBefore ? property.slice(7) : property).trim().replace(/\s+/g, ' '),
      className: element.getAttribute('class'),
      attributes: Object.fromEntries(Array.from(element.attributes, item => [item.name, item.value])),
      rect: { width: rect.width, height: rect.height, top: rect.top, left: rect.left },
      scroll: { x: window.scrollX, y: window.scrollY },
      ...(measureLayout
        ? { layout: {
            display: style.display,
            width: rect.width,
            height: rect.height,
            children: Array.from(element.querySelectorAll(':scope > [data-layout-child]'), (child) => {
              const childRect = child.getBoundingClientRect()
              return { left: childRect.left - rect.left, top: childRect.top - rect.top, width: childRect.width, height: childRect.height }
            }),
          } }
        : {}),
    }
  }, { property: probe.property, measureLayout: !!probe.layout })
}
