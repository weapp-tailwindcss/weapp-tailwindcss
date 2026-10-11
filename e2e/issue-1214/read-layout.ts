import type { MiniProgram } from '@weapp-vite/miniprogram-automator'
import type { LayoutRects, Rect } from './layout'
import { layoutNodes, measureLayout } from './layout'

export async function readLayoutRects(miniProgram: Pick<MiniProgram, 'evaluate'>) {
  const kinds = ['utility', 'reference'] as const
  const selectors = kinds.flatMap(kind => layoutNodes.map(name => `#${kind}-${name}`))
  // 坐标和尺寸必须来自同一批布局矩形，不能混用整数 offsetWidth/offsetHeight。
  const results: unknown = await miniProgram.evaluate(`function (selectors) {
    return new Promise(function (resolve) {
      const query = wx.createSelectorQuery();
      for (const selector of selectors) {
        query.select(selector).boundingClientRect();
      }
      query.exec(resolve);
    });
  }`, selectors)
  if (!Array.isArray(results) || results.length !== selectors.length) {
    throw new Error('尺寸对照页没有返回完整的布局矩形。')
  }
  const rects = results.map((value: unknown, index): Rect => {
    const selector = selectors[index]!
    if (!value || typeof value !== 'object' || !('id' in value) || value.id !== selector.slice(1)) {
      throw new Error(`尺寸对照页缺少 ${selector} 的布局矩形。`)
    }
    const rect = value as Record<string, unknown>
    for (const field of ['left', 'top', 'width', 'height'] as const) {
      if (typeof rect[field] !== 'number' || !Number.isFinite(rect[field])) {
        throw new TypeError(`布局探针 ${selector} 缺少有效的 ${field}。`)
      }
    }
    return { left: rect['left'], top: rect['top'], width: rect['width'], height: rect['height'] } as Rect
  })
  const [utility, reference] = kinds.map((_, kindIndex) => {
    const group = Object.fromEntries(layoutNodes.map((name, nodeIndex) => [name, rects[kindIndex * layoutNodes.length + nodeIndex]])) as LayoutRects
    measureLayout(group)
    return group
  })
  return { utility: utility!, reference: reference!, rawRects: results }
}
