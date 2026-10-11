export interface Rect {
  left: number
  top: number
  width: number
  height: number
}

export const layoutNodes = ['box', 'padding', 'padding-child', 'anchor', 'margin', 'gap-first', 'gap-second'] as const
export type LayoutRects = Record<typeof layoutNodes[number], Rect>

export function measureLayout(rects: LayoutRects) {
  for (const [name, rect] of Object.entries(rects)) {
    if (![rect.left, rect.top, rect.width, rect.height].every(Number.isFinite) || rect.width <= 0 || rect.height <= 0) {
      throw new Error(`布局探针 ${name} 缺少有效的渲染矩形：${JSON.stringify(rect)}`)
    }
  }
  return {
    width: rects.box.width,
    height: rects.box.height,
    paddingLeft: rects['padding-child'].left - rects.padding.left,
    paddingTop: rects['padding-child'].top - rects.padding.top,
    negativeMargin: rects.margin.top - rects.anchor.top - rects.anchor.height,
    // gap 必须来自两个子元素的位置，不能只读取容器的 CSS 声明。
    gap: rects['gap-second'].left - rects['gap-first'].left - rects['gap-first'].width,
  }
}

export function compareLayout(utility: LayoutRects, reference: LayoutRects, windowWidth: number, spacingRpx: number) {
  if (!Number.isFinite(windowWidth) || windowWidth <= 0 || !Number.isFinite(spacingRpx) || spacingRpx <= 0) {
    throw new Error('尺寸对照需要有效的窗口宽度和 rpx 基数。')
  }
  const expected = {
    width: 32,
    height: 32,
    paddingLeft: 4,
    paddingTop: 4,
    negativeMargin: -4,
    gap: 4,
  }
  const actual = measureLayout(utility)
  const control = measureLayout(reference)
  const comparisons = Object.entries(expected).map(([key, multiple]) => {
    const name = key as keyof typeof expected
    const expectedPx = multiple * spacingRpx * windowWidth / 750
    const measured = actual[name]
    const referencePx = control[name]
    // 同批矩形只容忍坐标相减的浮点误差；rpx 的原生量化由直接长度对照承接。
    const tolerancePx = 0.000001
    const expectedDirection = Math.sign(multiple)
    return {
      name,
      measured,
      referencePx,
      expectedPx,
      theoreticalDeviationPx: measured - expectedPx,
      referenceTheoreticalDeviationPx: referencePx - expectedPx,
      tolerancePx,
      passed: Math.abs(measured - referencePx) <= tolerancePx
        && Math.sign(measured) === expectedDirection
        && Math.sign(referencePx) === expectedDirection,
    }
  })
  return { passed: comparisons.every(value => value.passed), comparisons }
}
