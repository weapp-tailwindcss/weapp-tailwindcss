import type { AppsGeneratorCompareReportItem } from './apps-generator-report'

/** 定向验证只替换本轮实际构建的项目与平台，保留其他基线行及其顺序。 */
export function mergeScopedGeneratorReport(
  baseline: AppsGeneratorCompareReportItem[],
  current: AppsGeneratorCompareReportItem[],
) {
  const key = (item: AppsGeneratorCompareReportItem) => JSON.stringify([item.name, item.platform])
  const pending = new Map(current.map(item => [key(item), item]))
  if (pending.size !== current.length) {
    throw new Error('Generator 报告包含重复的项目与平台')
  }
  const merged = baseline.map((item) => {
    const identity = key(item)
    const replacement = pending.get(identity)
    pending.delete(identity)
    return replacement ?? item
  })
  return [...merged, ...pending.values()]
}
