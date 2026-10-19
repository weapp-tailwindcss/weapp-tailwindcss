import type { Browser } from 'playwright'
import type { RunContext } from './tailwind-capabilities/context'
import type { CaseContract } from './tailwind-capabilities/types'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runFrameworkSource } from './tailwind-capabilities/framework-source'

const mocks = vi.hoisted(() => ({ launch: vi.fn(), persist: vi.fn() }))
// 只验证执行和清理协议；本文件绝不启动真实浏览器或开发服务器。
vi.mock('playwright', () => ({ chromium: { launch: mocks.launch }, firefox: { launch: mocks.launch }, webkit: { launch: mocks.launch } }))
vi.mock('./tailwind-capabilities/framework-source/server', () => ({
  withFrameworkSourceServer: async () => {
    throw new Error('本测试禁止启动服务器')
  },
}))
vi.mock('./tailwind-capabilities/context', () => ({
  newReport: async (context: RunContext, target: string, contracts: CaseContract[], _fixture: unknown, environment: Record<string, string | number | boolean>) => {
    if (!contracts.length) {
      throw new Error('空匹配不能验收')
    }
    await mkdir(context.directory, { recursive: true })
    const hash = 'a'.repeat(64)
    return { schemaVersion: 2, runId: context.runId, target, observedAt: new Date().toISOString(), identity: { sourceHash: hash, lockfileHash: hash, catalogHash: hash, fixtureHash: hash, expectationsHash: hash, versions: { tailwindcss: '4.3.3' } }, environment, results: [], artifacts: [] }
  },
  persistReport: mocks.persist,
}))

const directories: string[] = []
beforeEach(() => {
  vi.clearAllMocks()
  mocks.launch.mockRejectedValue(new Error('browser unavailable'))
})
afterEach(async () => {
  for (const directory of directories.splice(0)) {
    await rm(directory, { recursive: true, force: true })
  }
})
async function run(caseFilter?: RegExp, borrowedBrowser?: Browser) {
  const directory = await mkdtemp(path.join(tmpdir(), 'tailwind-framework-protocol-'))
  directories.push(directory)
  return runFrameworkSource({ root: directory, directory, runId: 'framework-test', ...(caseFilter ? { caseFilter } : {}) }, 'chromium', borrowedBrowser)
}

describe('真实框架 runner 资源与失败边界', () => {
  it('启动不可用时18例都记录阻塞，空选择报错', async () => {
    const report = await run()
    expect(report.results).toHaveLength(18)
    expect(report.results.every(result => result.status === 'blocked')).toBe(true)
    expect(mocks.launch).toHaveBeenCalledExactlyOnceWith({ headless: true })
    await expect(run(/^missing$/)).rejects.toThrow('空匹配')
  })

  it('借用Browser只关闭本runner context，不关闭共享Browser', async () => {
    const close = vi.fn(async () => {})
    const contextClose = vi.fn(async () => {})
    const borrowed = { version: () => 'shared-browser', close, newContext: async () => ({ addInitScript: async () => {}, newPage: async () => {
      throw new Error('page failed')
    }, close: contextClose }) } as unknown as Browser
    const report = await run(/^framework\/react\/conditional$/, borrowed)
    expect(report.results).toMatchObject([{ status: 'blocked', reason: expect.stringContaining('page failed') }])
    expect(contextClose).toHaveBeenCalledOnce()
    expect(close).not.toHaveBeenCalled()
    expect(mocks.launch).not.toHaveBeenCalled()
  })

  it('借用context清理失败不能通过，自己的Browser在context失败后仍关闭', async () => {
    const close = vi.fn(async () => {})
    const contextClose = vi.fn(async () => {
      throw new Error('context close refused')
    })
    const browser = { version: () => 'owned-browser', close, newContext: async () => ({ addInitScript: async () => {}, newPage: async () => {
      throw new Error('page failed')
    }, close: contextClose }) } as unknown as Browser
    const borrowed = await run(/^framework\/vue\/array$/, browser)
    expect(borrowed.results).toMatchObject([{ status: 'failed', reason: expect.stringContaining('context close refused') }])
    expect(close).not.toHaveBeenCalled()
    mocks.launch.mockResolvedValue(browser)
    const owned = await run(/^framework\/vue\/array$/)
    expect(owned.results[0]!.status).toBe('failed')
    expect(close).toHaveBeenCalledOnce()
  })
})
