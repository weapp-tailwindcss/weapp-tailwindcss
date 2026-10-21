import type { Browser, Page } from 'playwright'
import type { SourceFramework, SourceRevision } from './fixtures'
import type { FrameworkSourceServer } from './server'
import { Buffer } from 'node:buffer'
import { EventEmitter } from 'node:events'
import { vi } from 'vitest'
import { frameworkSource, frameworkSourceProfiles, sourceCandidate, sourceExpectedWidth } from './fixtures'

/** 合成页面只验证runner控制流，不能充当真实浏览器或框架执行证据。 */
export function syntheticFrameworkRunner(onClose?: (page: EventEmitter, framework: SourceFramework) => void) {
  const events: string[] = []
  const pages: Array<EventEmitter & { shots: number }> = []
  let framework: SourceFramework = 'react'
  let revision: SourceRevision = 'initial'
  let active = true
  let documentNumber = 0
  const refresh = async () => {
    documentNumber++
    active = true
  }
  const contextClose = vi.fn(async () => {})
  const browserClose = vi.fn(async () => {})
  const newPage = vi.fn(async () => {
    const page = Object.assign(new EventEmitter(), { shots: 0 })
    pages.push(page)
    let closed = false
    return Object.assign(page, {
      isClosed: () => closed,
      goto: refresh,
      reload: refresh,
      waitForNavigation: async () => {},
      waitForLoadState: async () => {},
      waitForFunction: async () => {},
      evaluate: async (_read: unknown, kinds: string[]) => kinds.map((kind) => {
        const profile = frameworkSourceProfiles.find(item => item.framework === framework && item.kind === kind)!
        return { kind, classes: ['source-probe', 'p-4', sourceCandidate(profile, revision, active)].filter(Boolean).join(' '), width: sourceExpectedWidth(profile, revision, active), padding: 16, active: String(active), node: `node-${documentNumber}-${kind}`, session: `session-${documentNumber}`, marker: `framework-test/${framework}/${revision}`, instance: framework }
      }),
      locator: () => ({
        click: async () => { active = !active },
        allTextContents: async () => ['.p-4{padding:16px}', ...frameworkSourceProfiles.filter(profile => profile.framework === framework && profile.kind !== 'interpolation-negative').flatMap(profile => [true, false].map(branch => sourceCandidate(profile, revision, branch))).filter(Boolean).map(candidate => `.${candidate.replaceAll('[', '\\[').replaceAll(']', '\\]')}{width:${candidate.match(/\d+px/)![0]}}`)],
      }),
      screenshot: async () => {
        page.shots++
        return Buffer.from('synthetic-runner-only')
      },
      close: async () => {
        events.push(`page-close:${framework}`)
        onClose?.(page, framework)
        closed = true
      },
    }) as unknown as Page
  })
  const browser = { version: () => 'synthetic', close: browserClose, newContext: async () => ({ addInitScript: async () => {}, newPage, close: contextClose }) } as unknown as Browser
  const server = async (_root: string, runId: string, selected: SourceFramework, _logs: string[], callback: (server: FrameworkSourceServer) => Promise<unknown>) => {
    framework = selected
    revision = 'initial'
    try {
      return await callback({ url: 'http://fixture.invalid/', instance: selected, updateSource: async (next) => {
        revision = next
        return frameworkSource(selected, next, runId)
      } } as FrameworkSourceServer)
    }
    finally {
      events.push(`server-close:${framework}`)
    }
  }
  return { browser, server, events, pages, newPage, contextClose, browserClose }
}
