import type { LayoutRects } from './issue-1214/layout'
import vm from 'node:vm'
import { describe, expect, it } from 'vitest'
import { compareLayout, measureLayout } from './issue-1214/layout'
import { readLayoutRects } from './issue-1214/read-layout'

function rects(left = 0, top = 0): LayoutRects {
  return {
    'box': { left, top, width: 128, height: 128 },
    'padding': { left, top: top + 150, width: 128, height: 64 },
    'padding-child': { left: left + 16, top: top + 166, width: 16, height: 16 },
    'anchor': { left, top: top + 220, width: 64, height: 32 },
    'margin': { left, top: top + 236, width: 16, height: 16 },
    'gap-first': { left, top: top + 280, width: 16, height: 16 },
    'gap-second': { left: left + 32, top: top + 280, width: 16, height: 16 },
  }
}

describe('Issue #1214 运行时尺寸验收判定', () => {
  it('对照原生 rpx 的宽高、padding、负 margin 与子元素 gap，不依赖绝对位置', () => {
    const evidence = compareLayout(rects(), rects(180.12345, 20.54321), 375, 8)
    expect(evidence.passed).toBe(true)
    expect(evidence.comparisons.map(value => value.measured)).toEqual([128, 128, 16, 16, -16, 16])
  })

  it.each(['width', 'padding', 'negative-margin', 'gap'])('%s 未生效时不能被对照截图掩盖', (kind) => {
    const actual = rects()
    if (kind === 'width') {
      actual.box.width = 170
    }
    if (kind === 'padding') {
      actual['padding-child'].left = actual.padding.left
    }
    if (kind === 'negative-margin') {
      actual.margin.top = actual.anchor.top + actual.anchor.height
    }
    if (kind === 'gap') {
      actual['gap-second'].left = actual['gap-first'].left + actual['gap-first'].width
    }
    expect(compareLayout(actual, rects(180), 375, 8).passed).toBe(false)
  })

  it('390px 窗口下原生 32rpx 量化为 16px 时，不强制套用理论 16.64px', () => {
    const utility = rects()
    utility.box.width = utility.box.height = 133
    const evidence = compareLayout(utility, structuredClone(utility), 390, 8)
    expect(evidence.passed).toBe(true)
    const gap = evidence.comparisons.find(value => value.name === 'gap')!
    expect(gap.expectedPx).toBe(16.64)
    expect(gap.measured).toBe(16)
    expect(gap.referenceTheoreticalDeviationPx).toBeCloseTo(-0.64)
  })

  it('工具类偏差小于旧半像素容差时也不能通过', () => {
    const utility = rects()
    utility['gap-second'].left += 0.25
    expect(compareLayout(utility, rects(180), 375, 8).passed).toBe(false)
  })

  it.each(['zero-gap', 'positive-margin'])('两组同时出现 %s 错误时仍不通过', (kind) => {
    const utility = rects()
    if (kind === 'zero-gap') {
      utility['gap-second'].left = utility['gap-first'].left + utility['gap-first'].width
    }
    else {
      utility.margin.top = utility.anchor.top + utility.anchor.height + 16
    }
    expect(compareLayout(utility, structuredClone(utility), 375, 8).passed).toBe(false)
  })

  it('缺少渲染几何信息时直接失败', () => {
    const actual = rects()
    actual['gap-second'].width = 0
    expect(() => compareLayout(actual, rects(180), 375, 8)).toThrow('缺少有效的渲染矩形')
  })
})

describe('Issue #1214 微信布局矩形采集', () => {
  function miniProgramFor(utility: LayoutRects, reference: LayoutRects, missing?: string) {
    const nodes = Object.fromEntries(Object.entries({ utility, reference }).flatMap(([kind, group]) => Object.entries(group).map(([name, rect]) => {
      const id = `${kind}-${name}`
      return [`#${id}`, { id, ...rect }]
    })))
    let queryCount = 0
    let execCount = 0
    const miniProgram = {
      async evaluate(source: string, selectors: string[]) {
        const query = {
          selectors: [] as string[],
          select(selector: string) {
            query.selectors.push(selector)
            return { boundingClientRect: () => query }
          },
          exec(callback: (results: unknown[]) => void) {
            execCount++
            callback(query.selectors.map(selector => selector === missing ? null : nodes[selector]))
          },
        }
        const collect = vm.runInNewContext(`(${source})`, {
          wx: {
            createSelectorQuery() {
              queryCount++
              return query
            },
          },
        })
        return collect(selectors)
      },
    }
    return { miniProgram, counts: () => ({ queryCount, execCount }) }
  }

  it('同一批原生矩形保留小数尺寸，gap 不受整数 offsetWidth 污染', async () => {
    const utility = rects()
    utility['gap-first'].width = 16.640625
    utility['gap-second'].left = 33.28125
    const reference = structuredClone(utility)
    const fixture = miniProgramFor(utility, reference)
    const result = await readLayoutRects(fixture.miniProgram)
    expect(result.utility).toEqual(utility)
    expect(result.reference).toEqual(reference)
    expect(result.rawRects).toHaveLength(14)
    expect(measureLayout(result.utility).gap).toBe(16.640625)
    expect(fixture.counts()).toEqual({ queryCount: 1, execCount: 1 })
  })

  it('缺失原生节点时失败，不回退到其他测量接口', async () => {
    const fixture = miniProgramFor(rects(), rects(180), '#reference-gap-second')
    await expect(readLayoutRects(fixture.miniProgram)).rejects.toThrow('缺少 #reference-gap-second')
  })

  it.each([Number.NaN, '16', undefined, 0])('拒绝无效的原生尺寸 %s', async (width) => {
    const utility = rects()
    utility.box.width = width as number
    const fixture = miniProgramFor(utility, rects(180))
    await expect(readLayoutRects(fixture.miniProgram)).rejects.toThrow('缺少有效')
  })
})
