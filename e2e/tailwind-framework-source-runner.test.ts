import type { Browser } from 'playwright'
import type { RunContext } from './tailwind-capabilities/context'
import type { CaseContract } from './tailwind-capabilities/types'
import { Buffer } from 'node:buffer'
import { EventEmitter } from 'node:events'
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runFrameworkSource } from './tailwind-capabilities/framework-source'
import { frameworkSourceContract } from './tailwind-capabilities/framework-source/contract'
import { frameworkSourceProfiles } from './tailwind-capabilities/framework-source/fixtures'
import { syntheticFrameworkRunner } from './tailwind-capabilities/framework-source/runner-fixture'

const mocks = vi.hoisted(() => ({ launch: vi.fn(), persist: vi.fn(), server: vi.fn() }))
// 只验证执行和清理协议；本文件绝不启动真实浏览器或开发服务器。
vi.mock('playwright', () => ({ chromium: { launch: mocks.launch, executablePath: () => '/unit/full-chromium' }, firefox: { launch: mocks.launch }, webkit: { launch: mocks.launch } }))
vi.mock('./tailwind-capabilities/framework-source/server', () => ({
  withFrameworkSourceServer: mocks.server,
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
  mocks.server.mockImplementation(async () => {
    throw new Error('本测试禁止启动服务器')
  })
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
  it('完整18例通过时每框架12态齐全并按归属关闭资源', async () => {
    const fixture = syntheticFrameworkRunner()
    mocks.server.mockImplementation(fixture.server)
    const report = await run(undefined, fixture.browser)
    expect(report.results).toHaveLength(18)
    for (const result of report.results) {
      expect(result.status).toBe('passed')
      expect(result.assertions).toHaveLength(frameworkSourceContract(frameworkSourceProfiles.find(profile => profile.id === result.id)!).requiredAssertions.length)
    }
    expect(fixture.pages.map(page => page.shots)).toEqual([12, 12])
    expect(fixture.events).toEqual(['page-close:react', 'server-close:react', 'page-close:vue', 'server-close:vue'])
    expect(fixture.contextClose).toHaveBeenCalledOnce()
    expect(fixture.browserClose).not.toHaveBeenCalled()
    expect(fixture.pages.every(page => page.listenerCount('response') === 0 && page.listenerCount('console') === 0)).toBe(true)
  })

  it.each(['pageerror', 'response', 'requestfailed'] as const)('全部样式语义通过时收尾%s仍使最终报告失败', async (event) => {
    const fixture = syntheticFrameworkRunner((page) => {
      if (event === 'pageerror') {
        page.emit(event, new Error('late page error'))
      }
      else if (event === 'response') {
        page.emit(event, { status: () => 404, statusText: () => 'Not Found', url: () => 'http://fixture.invalid/missing.svg', request: () => ({ resourceType: () => 'image' }) })
      }
      else {
        page.emit(event, { failure: () => ({ errorText: 'net::ERR_FAILED' }), url: () => 'http://fixture.invalid/missing.svg', resourceType: () => 'image' })
      }
    })
    mocks.server.mockImplementation(fixture.server)
    const report = await run(/^framework\/react\//, fixture.browser)
    expect(report.results.every(result => result.status === 'failed')).toBe(true)
    expect(report.results.every(result => result.assertions.filter(assertion => assertion.name !== 'no-page-errors').every(assertion => assertion.actual === assertion.expected))).toBe(true)
    expect(report.results[0]!.warnings[0]).toContain('react/cleanup')
    if (event !== 'pageerror') {
      expect(report.results[0]!.warnings[0]).toContain('http://fixture.invalid/missing.svg')
    }
  })

  it('下一框架setup失败时错误工件不继承上一框架记录', async () => {
    const fixture = syntheticFrameworkRunner(page => page.emit('pageerror', new Error('react-only-error')))
    mocks.server.mockImplementationOnce(fixture.server).mockRejectedValueOnce(new Error('vue setup refused'))
    const report = await run(/^framework\/(react|vue)\/conditional$/, fixture.browser)
    expect(report.results[0]!.status).toBe('failed')
    expect(report.results[1]).toMatchObject({ status: 'blocked', warnings: [] })
    const output = mocks.persist.mock.calls.at(-1)![0]
    expect(JSON.parse(await readFile(path.join(output.directory, 'vue-browser-errors.json'), 'utf8'))).toEqual([])
  })

  it('框架页面先于服务关闭，收尾错误保留URL和阶段，下一框架使用新页面', async () => {
    const events: string[] = []
    const pages: EventEmitter[] = []
    const newPage = vi.fn(async () => {
      const page = new EventEmitter()
      pages.push(page)
      let closed = false
      return Object.assign(page, {
        isClosed: () => closed,
        goto: async () => { throw new Error('navigation refused') },
        screenshot: async () => Buffer.from('failure screenshot'),
        content: async () => '<html>failure</html>',
        close: async () => {
          events.push('page-close')
          page.emit('console', { type: () => 'error', text: () => 'late resource error', location: () => ({ url: 'http://fixture.invalid/late.svg', lineNumber: 3, columnNumber: 1 }) })
          closed = true
        },
      })
    })
    const browser = { version: () => 'borrowed', newContext: async () => ({ addInitScript: async () => {}, newPage, close: async () => {} }) } as unknown as Browser
    mocks.server.mockImplementation(async (_root, _runId, framework, _logs, callback) => {
      try {
        await callback({ url: 'http://fixture.invalid/', instance: framework })
      }
      finally {
        events.push(`server-close:${framework}`)
      }
    })
    const report = await run(/^framework\/(react|vue)\/conditional$/, browser)
    expect(events).toEqual(['page-close', 'server-close:react', 'page-close', 'server-close:vue'])
    expect(newPage).toHaveBeenCalledTimes(2)
    for (const result of report.results) {
      expect(result.status).toBe('blocked')
      expect(result.assertions).toContainEqual({ name: 'no-page-errors', stage: 'runtime', actual: false, expected: true })
      expect(result.warnings).toHaveLength(1)
    }
    const output = mocks.persist.mock.calls.at(-1)![0]
    for (const framework of ['react', 'vue']) {
      const evidence = JSON.parse(await readFile(path.join(output.directory, `${framework}-browser-errors.json`), 'utf8'))
      expect(evidence).toMatchObject([{ event: 'console-error', stage: `${framework}/cleanup`, url: 'http://fixture.invalid/late.svg', lineNumber: 3 }])
    }
    expect(pages.every(page => page.listenerCount('console') === 0 && page.listenerCount('pageerror') === 0)).toBe(true)
  })

  it('服务退出的错误仍参与最终门禁并保留失败原因', async () => {
    const page = new EventEmitter()
    let closed = false
    Object.assign(page, {
      isClosed: () => closed,
      goto: async () => { throw new Error('navigation refused') },
      screenshot: async () => Buffer.from('failure screenshot'),
      content: async () => '<html>failure</html>',
      close: async () => { closed = true },
    })
    const browser = { version: () => 'borrowed', newContext: async () => ({ addInitScript: async () => {}, newPage: async () => page, close: async () => {} }) } as unknown as Browser
    mocks.server.mockImplementation(async (_root, _runId, _framework, logs, callback) => {
      await callback({ url: 'http://fixture.invalid/', instance: 'instance' })
      logs.push('error:server cleanup error')
      throw new Error('server close refused')
    })
    const report = await run(/^framework\/react\/conditional$/, browser)
    expect(report.results[0]!.reason).toContain('server close refused')
    expect(report.results[0]!.assertions).toContainEqual({ name: 'no-page-errors', stage: 'runtime', actual: false, expected: true })
  })

  it('页面拒绝关闭后停止后续框架，由context收尾，不能复用受污染页面', async () => {
    const page = new EventEmitter()
    const close = vi.fn(async () => {
      throw new Error('page close refused')
    })
    Object.assign(page, {
      isClosed: () => false,
      goto: async () => { throw new Error('navigation refused') },
      screenshot: async () => Buffer.from('failure screenshot'),
      content: async () => '<html>failure</html>',
      close,
    })
    const contextClose = vi.fn(async () => {})
    const browserClose = vi.fn(async () => {})
    const browser = { version: () => 'borrowed', close: browserClose, newContext: async () => ({ addInitScript: async () => {}, newPage: async () => page, close: contextClose }) } as unknown as Browser
    mocks.server.mockImplementation(async (_root, _runId, _framework, _logs, callback) => callback({ url: 'http://fixture.invalid/', instance: 'instance' }))
    const report = await run(/^framework\/(react|vue)\/conditional$/, browser)
    expect(mocks.server).toHaveBeenCalledOnce()
    expect(close).toHaveBeenCalledOnce()
    expect(report.results).toMatchObject([{ id: 'framework/react/conditional', reason: expect.stringContaining('page close refused') }, { id: 'framework/vue/conditional', status: 'blocked', reason: expect.stringContaining('page close refused') }])
    expect(contextClose).toHaveBeenCalledOnce()
    expect(browserClose).not.toHaveBeenCalled()
  })

  it('启动不可用时18例都记录阻塞，空选择报错', async () => {
    const report = await run()
    expect(report.results).toHaveLength(18)
    expect(report.results.every(result => result.status === 'blocked')).toBe(true)
    expect(mocks.launch).toHaveBeenCalledExactlyOnceWith({ headless: true, executablePath: '/unit/full-chromium' })
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
