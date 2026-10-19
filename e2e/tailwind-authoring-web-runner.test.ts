import type { RunContext } from './tailwind-capabilities/context'
import type { CaseContract } from './tailwind-capabilities/types'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runAuthoringWeb } from './tailwind-capabilities/authoring-web'

const mocks = vi.hoisted(() => ({ launch: vi.fn(), persist: vi.fn() }))
// 此测试只验证启动失败和清理协议，绝不启动真实浏览器。
vi.mock('playwright', () => ({ chromium: { launch: mocks.launch }, firefox: { launch: mocks.launch }, webkit: { launch: mocks.launch } }))
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
async function run(caseFilter?: RegExp) {
  const directory = await mkdtemp(path.join(tmpdir(), 'tailwind-authoring-browser-contract-'))
  directories.push(directory)
  return runAuthoringWeb({ root: directory, directory, runId: 'authoring-web-test', ...(caseFilter ? { caseFilter } : {}) }, 'chromium')
}

describe('authoring 浏览器执行边界', () => {
  it('浏览器不可用时只记录阻塞，缺 oracle 的条目仍明确未执行', async () => {
    const report = await run()
    expect(report.results.filter(result => result.status === 'blocked')).toHaveLength(15)
    expect(report.results.filter(result => result.status === 'not-run')).toHaveLength(14)
    expect(report.results.some(result => result.status === 'passed')).toBe(false)
    expect(mocks.launch).toHaveBeenCalledExactlyOnceWith({ headless: true })
    expect(mocks.persist).toHaveBeenCalled()
  })

  it('只选扫描 runtime 缺口时不启动浏览器，不用空测量冒充通过', async () => {
    const report = await run(/^authoring\/scan-/)
    expect(report.results).toHaveLength(11)
    expect(report.results.every(result => result.status === 'not-run')).toBe(true)
    expect(mocks.launch).not.toHaveBeenCalled()
  })

  it('空过滤报错，清理失败保留错误与本任务资源身份', async () => {
    await expect(run(/^missing$/)).rejects.toThrow('空匹配')
    const close = vi.fn().mockRejectedValue(new Error('close refused'))
    mocks.launch.mockResolvedValue({
      version: () => 'mock-browser',
      newContext: async () => {
        throw new Error('context failed')
      },
      close,
    })
    const report = await run(/^authoring\/import$/)
    expect(close).toHaveBeenCalledOnce()
    expect(report.environment.cleanupError).toContain('close refused')
    expect(report.results).toMatchObject([{ status: 'failed', reason: expect.stringContaining('关闭失败') }])
  })
})
