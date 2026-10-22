import path from 'node:path'
import { exactNames } from './files'

export interface VisualCase {
  project: string
  viewport: 'desktop' | 'mobile'
  route: string
  title: string
  skipped: boolean
}

/** 对应既有截图合同：三引擎桌面与 Chromium 移动；其余移动组合保持显式跳过。 */
export function expectedVisualCases(routes: string[]): VisualCase[] {
  if (!routes.length || new Set(routes).size !== routes.length || routes.some(route => !route.startsWith('/') || route.startsWith('//'))) {
    throw new Error('无效或重复的网站路由清单')
  }
  return ['chromium', 'firefox', 'webkit'].flatMap(project => (['desktop', 'mobile'] as const).flatMap(viewport => routes.map(route => ({
    project,
    viewport,
    route,
    title: `${viewport} ${route} screenshot`,
    skipped: viewport === 'mobile' && project !== 'chromium',
  }))))
}

interface ReportResult {
  status: string
  retry: number
  errors?: unknown[]
  attachments: { name: string, contentType: string, path?: string }[]
}
interface ReportSuite {
  specs?: { title: string, tests: { projectName: string, expectedStatus: string, results: ReportResult[] }[] }[]
  suites?: ReportSuite[]
}

export function snapshotBindings(report: { errors?: unknown[], suites: ReportSuite[] }, snapshotsRoot: string, cases: VisualCase[]) {
  if (!Array.isArray(report.errors) || report.errors.length || !Array.isArray(report.suites)) {
    throw new Error('候选报告含错误或缺少完整运行结果')
  }
  const planned = new Map(cases.map(item => [`${item.project}:${item.title}`, item]))
  const seen: string[] = []
  const images: (VisualCase & { file: string })[] = []
  const pending = [...report.suites]
  while (pending.length) {
    const suite = pending.pop()!
    pending.push(...suite.suites ?? [])
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests) {
        const id = `${test.projectName}:${spec.title}`
        const expected = planned.get(id)
        if (!expected || test.results.length !== 1) {
          throw new Error(`候选包含额外用例、缺执行或重试：${id}`)
        }
        seen.push(id)
        const result = test.results[0]!
        if (result.retry !== 0 || result.errors?.length || result.status !== (expected.skipped ? 'skipped' : 'passed') || test.expectedStatus !== (expected.skipped ? 'skipped' : 'passed')) {
          throw new Error(`候选没有首次成功或跳过合同变化：${id}`)
        }
        if (expected.skipped) {
          continue
        }
        // Playwright 自身提供真实匿名快照路径，不复制其命名和截断算法。
        const attachments = result.attachments.filter(item => item.name.endsWith('-expected.png') && item.contentType === 'image/png')
        if (attachments.length !== 1 || !attachments[0]!.path) {
          throw new Error(`候选缺少唯一原生黄金附件：${id}`)
        }
        const relative = path.relative(snapshotsRoot, attachments[0]!.path!)
        if (path.isAbsolute(relative) || relative.startsWith(`..${path.sep}`) || relative === '..') {
          throw new Error(`候选附件逃出本轮目录：${id}`)
        }
        const parts = relative.split(path.sep)
        if (parts.length !== 2 || parts[0] !== 'index.spec.ts-snapshots') {
          throw new Error(`候选不属于受管截图目录：${relative}`)
        }
        images.push({ ...expected, file: parts[1]! })
      }
    }
  }
  exactNames(seen, [...planned.keys()])
  exactNames(images.map(item => item.file), images.map(item => item.file))
  return images.sort((a, b) => a.file.localeCompare(b.file))
}
