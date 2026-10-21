import type { AppsGeneratorCompareReportItem } from './apps-generator-report'

/** 同时按项目与目标限定构建，便于逐个平台审查和更新基线。 */
export function filterGeneratorProjects<T extends { name: string, platform: string }>(projects: T[], filters: { project?: string, platform?: string }) {
  const project = filters.project ? new RegExp(filters.project) : undefined
  const platform = filters.platform ? new RegExp(filters.platform) : undefined
  const selected = projects.filter(item => (!project || project.test(item.name)) && (!platform || platform.test(item.platform)))
  if ((project || platform) && selected.length === 0) {
    throw new Error(`Generator 定向过滤未匹配任何项目：${JSON.stringify(filters)}`)
  }
  return selected
}

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
