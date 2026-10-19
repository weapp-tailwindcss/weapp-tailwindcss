import type { Page } from 'playwright'
import type { WebControl } from './controls'
import type { WebLayout, WebProbe } from './probes'
import { applyControl, restoreControls } from './controls'

export interface WebObservation {
  actual: string
  className: string | null
  attributes: Record<string, string>
  rect: { width: number, height: number, top: number, left: number }
  scroll: { x: number, y: number }
  renderFrames?: number[]
  layout?: WebLayout
  guards?: Record<string, string>
  styles?: Record<string, string>
}

export async function prepareProbe(page: Page, probe: WebProbe): Promise<() => Promise<void>> {
  const prepared: WebControl[] = []
  try {
    for (const control of probe.controls ?? []) {
      prepared.push(control)
      await applyControl(page, control, false)
    }
  }
  catch (error) {
    try {
      await restoreControls(page, prepared)
    }
    catch (cleanupError) {
      throw new AggregateError([error, cleanupError], 'variant 前置设置与恢复失败')
    }
    throw error
  }
  return () => restoreControls(page, prepared)
}

export async function activateProbe(page: Page, probe: WebProbe, observeCheckpoint?: (checkpoint: NonNullable<WebProbe['checkpoints']>[number]) => Promise<void>): Promise<() => Promise<void>> {
  if (probe.controls?.length) {
    const applied: WebControl[] = []
    try {
      for (const [index, control] of probe.controls.entries()) {
        applied.push(control)
        await applyControl(page, control, true)
        for (const checkpoint of (probe.checkpoints ?? []).filter(item => item.afterControl === index + 1)) {
          if (!observeCheckpoint) {
            throw new Error(`${probe.id} 缺少实际中间状态观测回调`)
          }
          await observeCheckpoint(checkpoint)
        }
      }
    }
    catch (error) {
      try {
        await restoreControls(page, applied)
      }
      catch (cleanupError) {
        throw new AggregateError([error, cleanupError], 'variant 触发与恢复失败')
      }
      throw error
    }
    return () => restoreControls(page, applied)
  }
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
  return page.locator(probe.selector ?? '#probe').evaluate(async (element, { property, properties, measureLayout, guards, settleMedia }) => {
    // 原生媒体协议返回后跨越两次渲染帧，再读取同一文档的候选和独立对照。
    const renderFrames = settleMedia
      ? await new Promise<number[]>((resolve, reject) => {
          let frame = 0
          const timeout = setTimeout(() => {
            cancelAnimationFrame(frame)
            reject(new Error('原生媒体协议返回后未在5秒内完成两个渲染帧'))
          }, 5_000)
          frame = requestAnimationFrame((first) => {
            frame = requestAnimationFrame((second) => {
              clearTimeout(timeout)
              resolve([first, second])
            })
          })
        })
      : []
    const separator = property.indexOf(':')
    const pseudo = separator >= 0 ? `::${property.slice(0, separator)}` : undefined
    const style = window.getComputedStyle(element, pseudo)
    const rect = element.getBoundingClientRect()
    return {
      actual: style.getPropertyValue(separator >= 0 ? property.slice(separator + 1) : property).trim().replace(/\s+/g, ' '),
      styles: Object.fromEntries(properties.map(name => [name, style.getPropertyValue(name).trim().replace(/\s+/g, ' ')])),
      className: element.getAttribute('class'),
      attributes: Object.fromEntries(Array.from(element.attributes, item => [item.name, item.value])),
      rect: { width: rect.width, height: rect.height, top: rect.top, left: rect.left },
      scroll: { x: window.scrollX, y: window.scrollY },
      renderFrames,
      guards: Object.fromEntries(guards.map((guard) => {
        if (guard.kind === 'selection') {
          return [guard.name, window.getSelection()?.toString() ?? '']
        }
        if (guard.kind === 'media') {
          return [guard.name, String(window.matchMedia(guard.query).matches)]
        }
        const target = document.querySelector(guard.selector)!
        if (guard.kind === 'compare-style') {
          const reference = document.querySelector(guard.reference)!
          return [guard.name, String(window.getComputedStyle(target).getPropertyValue(guard.property).trim() === window.getComputedStyle(reference).getPropertyValue(guard.property).trim())]
        }
        return [guard.name, guard.kind === 'matches' ? String(target.matches(guard.condition)) : window.getComputedStyle(target, guard.pseudo).getPropertyValue(guard.property).trim().replace(/\s+/g, ' ')]
      })),
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
  }, { property: probe.property, properties: Object.keys(probe.styles ?? {}), measureLayout: !!probe.layout, guards: probe.guards ?? [], settleMedia: probe.controls?.some(control => control.kind === 'media') ?? false })
}
