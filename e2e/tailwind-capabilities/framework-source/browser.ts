import type { Page } from 'playwright'
import type { FrameworkSourceObservation } from './contract'
import type { FrameworkSourceProfile } from './fixtures'

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
