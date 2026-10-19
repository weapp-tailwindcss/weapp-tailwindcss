import type { Page } from 'playwright'
import type { FrameworkSourceObservation } from './contract'
import type { FrameworkSourceProfile, SourceFramework, SourceRevision } from './fixtures'

/** 保存前登记真实更新信号，防止 Vite 自动导航与随后明确刷新竞争。 */
export async function saveFrameworkSourceAndSettle(page: Page, framework: SourceFramework, revision: SourceRevision, runId: string, save: (revision: SourceRevision) => Promise<string>) {
  const marker = `${runId}/${framework}/${revision}`
  const waitForMarker = () => page.waitForFunction(expected => document.querySelector<HTMLElement>('#framework-root')?.dataset.revision === expected, marker, { timeout: 15_000 })
  // React 夹具没有 refresh 插件和 accept 边界，默认 Vite 会完整导航；Vue 则消费 SFC 更新。
  const automaticUpdate = framework === 'react' ? page.waitForNavigation({ waitUntil: 'networkidle', timeout: 15_000 }) : waitForMarker()
  const [, source] = await Promise.all([automaticUpdate, save(revision)])
  if (framework === 'react') {
    await waitForMarker()
  }
  await page.waitForLoadState('networkidle', { timeout: 15_000 })
  return source
}

/** 只读取真正由框架创建的节点，运行器不注入工具类或候选。 */
export async function readFrameworkSource(page: Page, profiles: FrameworkSourceProfile[]): Promise<FrameworkSourceObservation[]> {
  return page.evaluate((kinds) => {
    const root = document.querySelector<HTMLElement>('#framework-root')
    const session = String((globalThis as any).__frameworkSourceSession ?? '')
    const instance = document.querySelector('meta[name="framework-instance"]')?.getAttribute('content') ?? ''
    return kinds.map((kind) => {
      const element = document.getElementById(`probe-${kind}`) as HTMLElement & { __frameworkSourceNode?: string } | null
      if (!root || !element) {
        throw new Error(`真实框架节点缺失：${kind}`)
      }
      element.__frameworkSourceNode ??= crypto.randomUUID()
      const style = getComputedStyle(element)
      return { kind, classes: element.className, width: Number.parseFloat(style.width), padding: Number.parseFloat(style.paddingTop), active: element.dataset.active ?? '', node: element.__frameworkSourceNode, session, marker: root.dataset.revision ?? '', instance }
    })
  }, profiles.map(profile => profile.kind))
}
