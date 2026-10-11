import type { AppsGeneratorCompareReportItem } from './apps-generator-report'
import { describe, expect, it } from 'vitest'
import { mergeScopedGeneratorReport } from './apps-generator-report-scoped'

function item(name: string, platform: string, error: string): AppsGeneratorCompareReportItem {
  return { name, platform, error, fixture: 'demo', allowedPlatforms: [platform], cssFile: 'app.css', cssFiles: ['app.css'], status: 'failed' }
}

describe('定向 Generator 汇总基线', () => {
  it('按项目与平台替换，保留未运行行及原顺序，不修改输入', () => {
    const baseline = [item('a', 'web', '旧 web'), item('b', 'web', '未运行'), item('a', 'mp-weixin', '旧小程序')]
    const current = [item('a', 'mp-weixin', '新小程序'), item('a', 'web', '新 web')]
    const result = mergeScopedGeneratorReport(baseline, current)
    expect(result).toEqual([current[1], baseline[1], current[0]])
    expect(result[1]).toBe(baseline[1])
    expect(baseline[0]).toEqual(item('a', 'web', '旧 web'))
  })

  it('追加新覆盖平台，空集合不改变基线', () => {
    const baseline = [item('a', 'web', '原有')]
    const added = item('a', 'app-ios', '新增')
    expect(mergeScopedGeneratorReport(baseline, [added])).toEqual([...baseline, added])
    expect(mergeScopedGeneratorReport(baseline, [])).toEqual(baseline)
  })

  it('拒绝重复身份，避免静默覆盖本轮结果', () => {
    expect(() => mergeScopedGeneratorReport([], [item('a', 'web', '一'), item('a', 'web', '二')])).toThrow('重复')
  })
})
