import { readFile, rm } from 'node:fs/promises'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { request } from '../scripts/e2e-preflight/client'
import { recordComputerUseBlock } from '../scripts/e2e-preflight/computer-use'
import { consumerAlive } from '../scripts/e2e-preflight/lifecycle'
import { serve } from '../scripts/e2e-preflight/server'
import { PreflightSession } from '../scripts/e2e-preflight/session'
import { maxAgeMs } from '../scripts/e2e-preflight/types'
import { computerEvidence, fixtureSession, passingCheck } from './preflight-fixture'

const cleanups: Array<() => Promise<unknown>> = []
afterEach(async () => {
  vi.restoreAllMocks()
  for (const cleanup of cleanups.splice(0).reverse()) {
    await cleanup()
  }
})

async function setup() {
  const fixture = await fixtureSession()
  cleanups.push(() => rm(fixture.dir, { recursive: true, force: true }))
  return fixture
}

describe('预检中断与领取生命周期', () => {
  it('并发领取只允许一方进入复查', async () => {
    const { report, dir, session } = await setup()
    let resume!: () => void
    const pending = new Promise<void>((resolve) => {
      resume = resolve
    })
    const probe = vi.fn(async (id: 'base') => {
      await pending
      return passingCheck(id)
    })
    const live = new PreflightSession(report, session.file, dir, probe)
    await computerEvidence(session)
    live.interactionAt = session.interactionAt
    await session.verify(report.identity)
    const first = live.claim(report.identity, '123:consumer')
    await expect(live.claim(report.identity, '456:consumer')).rejects.toThrow('并发')
    resume()
    await expect(first).resolves.toHaveProperty('lease')
  })

  it('领取期间证据过期仍禁止启动', async () => {
    const { report, dir, session } = await setup()
    await computerEvidence(session)
    await session.verify(report.identity)
    const live = new PreflightSession(report, session.file, dir, async (id) => {
      vi.spyOn(Date, 'now').mockReturnValue(Date.parse(report.createdAt) + maxAgeMs + 10_000)
      return passingCheck(id)
    })
    live.interactionAt = session.interactionAt
    const execute = vi.fn()
    await expect(live.claim(report.identity, '123:consumer').then(execute)).rejects.toThrow()
    expect(execute).not.toHaveBeenCalled()
  })

  it('verify 后删去工具证据不能领取', async () => {
    const { session, report, dir } = await setup()
    await computerEvidence(session)
    await session.verify(report.identity)
    await rm(path.join(dir, 'computer.png'))
    await expect(session.claim(report.identity, '123:consumer')).rejects.toThrow()
  })

  it('取消等待 worker 结束，不把中断结果写成通过', async () => {
    const { report, dir, session } = await setup()
    let resume!: () => void
    const pending = new Promise<void>((resolve) => {
      resume = resolve
    })
    const live = new PreflightSession(report, session.file, dir, async (id) => {
      await pending
      return passingCheck(id)
    })
    const running = live.probes(['base'], 'prepare')
    const rejected = expect(running).rejects.toThrow()
    let closed = false
    const cancelling = live.cancel().then(() => {
      closed = true
    })
    await Promise.resolve()
    expect(closed).toBe(false)
    resume()
    await cancelling
    await rejected
    expect(report.checks[0]!.status).toBe('not-run')
  })

  it('活动服务记录 computer use 原始错误后不再放行', async () => {
    const { session, report, dir } = await setup()
    const server = await serve(session)
    cleanups.push(() => server.close())
    await request(report, 'block', { reason: 'Codex auth token is unavailable' })
    expect(report.status).toBe('blocked')
    expect(await readFile(path.join(dir, 'report.md'), 'utf8')).toContain('Codex auth token is unavailable')
    await expect(session.claim(report.identity, '123:consumer')).rejects.toThrow()
  })

  it('离线报告也只能补充失败，运行中阻断不声称从未执行测试', async () => {
    const { session, report, dir } = await setup()
    report.consumer = '123:consumer'
    report.status = 'running'
    await recordComputerUseBlock(report, session.file, '截图工具不可用')
    const text = await readFile(path.join(dir, 'report.md'), 'utf8')
    expect(text).toContain('停止后续阶段调度')
    expect(text).not.toContain('未启动测试子进程')
    expect(report.verifiedAt).toBeUndefined()
  })

  it('只查询明确的消费进程 PID，进程退出不能恢复旧会话', () => {
    const exists = vi.fn().mockReturnValue(false)
    expect(consumerAlive('123:C:\\中文 工作树', exists)).toBe(false)
    expect(exists).toHaveBeenCalledWith(123)
    exists.mockClear().mockReturnValue(true)
    expect(consumerAlive('invalid', exists)).toBe(false)
    expect(consumerAlive('0:repo', exists)).toBe(false)
    expect(exists).not.toHaveBeenCalled()
    expect(consumerAlive('123:/repo', exists)).toBe(true)
  })
})
