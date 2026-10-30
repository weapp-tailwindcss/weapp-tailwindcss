import { readFile, rm } from 'node:fs/promises'
import { afterEach, expect, it, vi } from 'vitest'
import { request } from '../scripts/e2e-preflight/client'
import { serve } from '../scripts/e2e-preflight/server'
import { PreflightSession } from '../scripts/e2e-preflight/session'
import { maxAgeMs } from '../scripts/e2e-preflight/types'
import { computerEvidence, fixtureSession, passingCheck } from './preflight-fixture'

const cleanups: Array<() => Promise<unknown>> = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) {
    await cleanup()
  }
})

async function fixture() {
  const item = await fixtureSession()
  cleanups.push(() => rm(item.dir, { force: true, recursive: true }))
  return item
}

it('HTTP verify 保留首次探针失败的阶段、端口和错误，不继续请求其他平台', async () => {
  const { report, session: original, dir } = await fixture()
  report.verifiedAt = new Date().toISOString()
  const detail = '微信 IDE 服务请求失败（isLogin，127.0.0.1:19355，ECONNREFUSED）'
  const probe = vi.fn(async (id: Parameters<typeof passingCheck>[0]) => id === 'wechat'
    ? { ...passingCheck(id), status: 'blocked' as const, detail, remedy: '核对实例与端口后重新预检，保留登录态。' }
    : passingCheck(id))
  const session = new PreflightSession(report, original.file, dir, probe)
  const server = await serve(session)
  cleanups.push(() => server.close())
  await computerEvidence(session)
  const error = await request(report, 'verify', { identity: report.identity }).catch(error => error)
  expect(error).toBeInstanceOf(Error)
  expect(error.message).toContain(`wechat 已阻断：${detail}`)
  expect(error.message).toContain('核对实例与端口后重新预检')
  expect(error.message).not.toContain('15 分钟')
  expect(probe.mock.calls.map(([id]) => id)).toEqual(['base', 'wechat'])
  expect(report.status).toBe('blocked')
  expect(report.verifiedAt).toBeUndefined()
  expect(report.checks.find(check => check.id === 'computer-use')?.status).toBe('passed')
  const saved = JSON.parse(await readFile(session.file, 'utf8'))
  expect(saved.status).toBe('blocked')
  expect(saved.verifiedAt).toBeUndefined()
})

it('全部探针返回通过但证据过期时，verify 不保留成功时间戳', async () => {
  const { report, session: original, dir } = await fixture()
  const session = new PreflightSession(report, original.file, dir, async id => ({
    ...passingCheck(id),
    ...(id === 'base' ? { checkedAt: new Date(Date.now() - maxAgeMs - 1000).toISOString() } : {}),
  }))
  await computerEvidence(session)
  await expect(session.verify(report.identity)).rejects.toThrow('超过 15 分钟')
  expect(report.status).toBe('blocked')
  expect(report.verifiedAt).toBeUndefined()
  expect(JSON.parse(await readFile(session.file, 'utf8')).verifiedAt).toBeUndefined()
})

it('就绪校验区分失败、缺项、状态、无效时间、未来时间和过期', async () => {
  const { report, session } = await fixture()
  await computerEvidence(session)
  await session.verify(report.identity)
  const wechat = report.checks.find(check => check.id === 'wechat')!
  wechat.status = 'blocked'
  wechat.detail = 'isLogin ECONNREFUSED'
  expect(() => session.assertReady()).toThrow('wechat: blocked；isLogin ECONNREFUSED')
  wechat.status = 'passed'
  report.checks.splice(report.checks.indexOf(wechat), 1)
  expect(() => session.assertReady()).toThrow('wechat: 缺少检查')
  report.checks.push(wechat)
  report.status = 'blocked'
  expect(() => session.assertReady()).toThrow('当前状态 blocked')
  report.status = 'ready'
  const now = Date.now()
  report.verifiedAt = 'invalid'
  expect(() => session.assertReady(now)).toThrow('verifiedAt 时间无效')
  report.verifiedAt = new Date(now + 1000).toISOString()
  expect(() => session.assertReady(now)).toThrow('verifiedAt 时间在未来')
  report.verifiedAt = new Date(now).toISOString()
  wechat.checkedAt = 'invalid'
  expect(() => session.assertReady(now)).toThrow('wechat 时间无效')
  wechat.checkedAt = new Date(now + 1000).toISOString()
  expect(() => session.assertReady(now)).toThrow('wechat 时间在未来')
  wechat.checkedAt = new Date(now - maxAgeMs - 1).toISOString()
  expect(() => session.assertReady(now)).toThrow('wechat 超过 15 分钟')
})
