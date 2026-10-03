import { rm } from 'node:fs/promises'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { request } from '../scripts/e2e-preflight/client'
import { stageChecks } from '../scripts/e2e-preflight/gate'
import { serve } from '../scripts/e2e-preflight/server'
import { initialChecks, PreflightSession } from '../scripts/e2e-preflight/session'
import { computerEvidence, fixtureSession, passingCheck } from './preflight-fixture'

const cleanups: Array<() => Promise<unknown>> = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) {
    await cleanup()
  }
})

async function setup(extended = false) {
  const fixture = await fixtureSession()
  cleanups.push(() => rm(fixture.dir, { recursive: true, force: true }))
  Object.assign(fixture.report, { extended, checks: initialChecks(extended) })
  return fixture
}

describe('扩展原生工具链预检范围', () => {
  it('普通报告不能领取扩展流程，服务端先拒绝且不运行探针', async () => {
    const { report, session, dir } = await setup()
    await computerEvidence(session)
    await session.verify(report.identity)
    const probe = vi.fn(async id => passingCheck(id))
    const live = new PreflightSession(report, session.file, dir, probe)
    live.interactionAt = session.interactionAt
    const server = await serve(live)
    cleanups.push(() => server.close())
    await computerEvidence(live)
    await expect(request(report, 'claim', { identity: report.identity, consumer: 'test', extended: true })).rejects.toThrow('prepare --extended')
    expect(probe).not.toHaveBeenCalled()
  })

  it('普通预检保留原有范围，扩展预检增加双端工具链', () => {
    expect(initialChecks().map(check => check.id)).not.toContain('runtime-android')
    expect(initialChecks(true).map(check => check.id)).toEqual(expect.arrayContaining(['runtime-android', 'runtime-ios']))
  })

  it.each(['runtime-android', 'runtime-ios'] as const)('%s 缺证时扩展报告不能通过 verify', async (id) => {
    const { report, session, dir } = await setup(true)
    await computerEvidence(session)
    const probe = vi.fn(async target => target === id
      ? { ...passingCheck(target), status: 'blocked' as const, detail: '工具缺失' }
      : passingCheck(target))
    const live = new PreflightSession(report, session.file, dir, probe)
    live.interactionAt = session.interactionAt
    await expect(live.verify(report.identity)).rejects.toThrow('禁止启动')
    expect(report.status).toBe('blocked')
  })

  it('扩展领取前重查工具链，阶段前再查且失败停止', async () => {
    const { report, session, dir } = await setup(true)
    await computerEvidence(session)
    await session.verify(report.identity)
    const probe = vi.fn(async id => passingCheck(id))
    const live = new PreflightSession(report, session.file, dir, probe)
    live.interactionAt = session.interactionAt
    const { lease } = await live.claim(report.identity, 'test', true)
    expect(probe.mock.calls.map(([id]) => id)).toEqual(expect.arrayContaining(['runtime-android', 'runtime-ios']))
    probe.mockImplementation(async id => ({ ...passingCheck(id), status: 'blocked' as const, detail: 'Java 版本改变' }))
    await expect(live.check(report.identity, lease, ['runtime-android'])).rejects.toThrow('Java 版本改变')
    expect(report.status).toBe('blocked')
    await live.finish(lease)
    expect(report.status).toBe('blocked')
  })

  it('仅扩展 RN/Lynx 原生阶段复查对应工具链', () => {
    expect(stageChecks('Lynx Android runtime', true)).toEqual(['android', 'runtime-android'])
    expect(stageChecks('React Native iOS runtime', true)).toEqual(['ios', 'runtime-ios'])
    expect(stageChecks('HBuilderX uni-app iOS HMR', true)).toEqual(['ios', 'hbuilderx'])
    expect(stageChecks('Lynx Android runtime')).toEqual(['android'])
  })
})
