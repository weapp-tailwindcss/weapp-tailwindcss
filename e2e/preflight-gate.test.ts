import { readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { execa } from 'execa'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { request } from '../scripts/e2e-preflight/client'
import { bindingEnvironment, enterFullTestGate, stageChecks } from '../scripts/e2e-preflight/gate'
import { assertIdentity, collectIdentity } from '../scripts/e2e-preflight/io'
import { acquireLock } from '../scripts/e2e-preflight/lock'
import { serve } from '../scripts/e2e-preflight/server'
import { PreflightSession } from '../scripts/e2e-preflight/session'
import { checkIds, maxAgeMs } from '../scripts/e2e-preflight/types'
import { computerEvidence, fixtureSession, passingCheck } from './preflight-fixture'

const cleanups: Array<() => Promise<unknown>> = []
beforeEach(() => {
  vi.stubEnv('LYNX_IOS_DESTINATION', undefined)
  vi.stubEnv('E2E_PREFLIGHT_WECHAT_APPID', undefined)
  vi.stubEnv('E2E_TEMPLATE_IDE_APP_ID', undefined)
})
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) {
    await cleanup()
  }
  vi.unstubAllEnvs()
})

async function setup() {
  const fixture = await fixtureSession()
  cleanups.push(() => rm(fixture.dir, { force: true, recursive: true }))
  return fixture
}

describe('全面测试预检门禁', () => {
  it.each(checkIds)('%s 未通过时不执行测试', async (id) => {
    const { session, report } = await setup()
    report.status = 'ready'
    report.verifiedAt = new Date().toISOString()
    report.checks = checkIds.map(item => ({ ...passingCheck('base'), id: item }))
    report.checks.find(item => item.id === id)!.status = 'blocked'
    const execute = vi.fn()
    await expect(session.claim(report.identity, 'test').then(execute)).rejects.toThrow('禁止启动')
    expect(execute).not.toHaveBeenCalled()
  })

  it('拒绝缺项、过期、未来时间及跨 checkout 的报告', async () => {
    const { session, report } = await setup()
    await computerEvidence(session)
    await session.verify(report.identity)
    const now = Date.now()
    expect(() => session.assertReady(now + maxAgeMs + 10)).toThrow('禁止启动')
    await expect(session.claim({ ...report.identity, root: path.resolve(report.identity.root, '..') }, 'test')).rejects.toThrow('已变化')
    report.verifiedAt = new Date(now + 1000).toISOString()
    expect(() => session.assertReady(now)).toThrow('禁止启动')
    report.verifiedAt = new Date().toISOString()
    report.checks.pop()
    expect(() => session.assertReady()).toThrow('禁止启动')
  })

  it('同一报告只能领取一次，目标掉线立即停止后续调度', async () => {
    const { report, session, dir } = await setup()
    await computerEvidence(session)
    await session.verify(report.identity)
    const probe = vi.fn(async (id: 'android') => ({ ...passingCheck(id), status: 'blocked' as const, detail: 'offline' }))
    const live = new PreflightSession(report, session.file, dir, probe)
    const execute = vi.fn()
    await expect(live.claim(report.identity, 'consumer').then(execute)).rejects.toThrow('阻断')
    expect(execute).not.toHaveBeenCalled()
    await session.verify(report.identity)
    const { lease } = await session.claim(report.identity, 'consumer')
    await expect(session.claim(report.identity, 'another')).rejects.toThrow()
    await session.finish(lease)
    await expect(session.check(report.identity, lease, ['android'])).rejects.toThrow('禁止继续')
  })

  it('手改 report.json 为 ready 不能绕过活动会话', async () => {
    const { session, report } = await setup()
    const server = await serve(session)
    cleanups.push(() => server.close())
    await session.save()
    await writeFile(session.file, JSON.stringify({ ...report, status: 'ready', checks: [] }))
    await expect(request(report, 'claim', { identity: report.identity, consumer: 'test' })).rejects.toThrow('禁止启动')
  })

  it('从实际门禁入口领取、绑定设备和复查；关闭会话后旧报告失效', async () => {
    const { session, report } = await setup()
    report.identity = await collectIdentity(process.cwd())
    const server = await serve(session)
    cleanups.push(() => server.close())
    await computerEvidence(session)
    await session.verify(report.identity)
    const gate = await enterFullTestGate(session.file)
    expect(gate.env.E2E_PREFLIGHT_WECHAT_HTTP_PORT).toBe('12345')
    expect(gate.env.E2E_HBUILDERX_ANDROID_DEVICE_ID).toBe('android')
    expect(gate.env.LYNX_ANDROID_DEVICE_ID).toBe('android')
    expect(gate.env.ANDROID_SERIAL).toBe('android')
    expect(gate.env.LYNX_IOS_DEVICE_ID).toBe('ios')
    expect(gate.env.LYNX_IOS_DESTINATION).toBe('platform=iOS Simulator,id=ios')
    await gate.check('hbuilderx-android')
    await gate.close()
    await expect(request(report, 'claim', { identity: report.identity, consumer: 'retry' })).rejects.toThrow()
  })

  it('正确选择设备阶段的存活检查', () => {
    expect(stageChecks('hbuilderx-ios')).toEqual(['ios', 'hbuilderx'])
    expect(stageChecks('H5 browser build and HMR')).toEqual(['web'])
    expect(stageChecks('visual-weapp-h5-app')).toContain('harmony')
    expect(stageChecks('Lynx Android runtime')).toEqual(['android'])
    expect(stageChecks('Lynx iOS runtime')).toEqual(['ios'])
    expect(stageChecks('React Native web HMR')).toEqual(['web'])
    expect(stageChecks('React Native Android HMR')).toEqual(['android'])
    expect(stageChecks('React Native iOS HMR')).toEqual(['ios'])
  })

  it('门禁绑定不覆盖冲突的 iOS destination', () => {
    const bindings = Object.fromEntries(['android', 'ios', 'harmony', 'hbuilderx', 'wechat', 'web'].map(id => [id, passingCheck(id as 'android').binding!]))
    expect(() => bindingEnvironment(bindings, { LYNX_IOS_DESTINATION: 'platform=iOS Simulator,id=other' })).toThrow('存在歧义')
    expect(bindingEnvironment(bindings, { LYNX_IOS_DESTINATION: 'platform=iOS Simulator,id=ios,arch=arm64' }).LYNX_IOS_DESTINATION)
      .toBe('platform=iOS Simulator,id=ios,arch=arm64')
  })

  it.each([{}, { E2E_PREFLIGHT_WECHAT_APPID: 'wx0123456789abcdef' }, { E2E_TEMPLATE_IDE_APP_ID: 'wx0123456789abcdef' }])('门禁固定实际验证 AppID 并同时传给两个入口：%j', (env) => {
    const appid = Object.keys(env).length ? 'wx0123456789abcdef' : 'wx6ffee4673b257014'
    const bindings = Object.fromEntries(['android', 'ios', 'harmony', 'hbuilderx', 'wechat', 'web'].map(id => [id, passingCheck(id as 'android').binding!]))
    bindings['wechat'] = { ...bindings['wechat'], appid }
    expect(bindingEnvironment(bindings, env)).toMatchObject({ E2E_PREFLIGHT_WECHAT_APPID: appid, E2E_TEMPLATE_IDE_APP_ID: appid })
    expect(() => bindingEnvironment({ ...bindings, wechat: { ...bindings['wechat'], appid: 'wx1111111111111111' } }, env)).toThrow('AppID')
    const missing = { ...bindings['wechat'] }
    delete missing['appid']
    expect(() => bindingEnvironment({ ...bindings, wechat: missing }, env)).toThrow('AppID')
  })

  it.each(['E2E_PREFLIGHT_WECHAT_HTTP_PORT', 'E2E_PREFLIGHT_WECHAT_APPID', 'E2E_TEMPLATE_IDE_APP_ID', 'LYNX_ANDROID_DEVICE_ID', 'ANDROID_SERIAL', 'LYNX_IOS_DEVICE_ID', 'LYNX_IOS_DESTINATION', 'RN_ANDROID_EXPO_DEVICE', 'JAVA_HOME', 'RN_JAVA_HOME', 'LYNX_JAVA_HOME', 'LYNX_GRADLE', 'LYNX_POD'])('%s 改变后旧门禁身份失效', async (key) => {
    vi.stubEnv(key, 'initial')
    const initial = await collectIdentity(process.cwd())
    vi.stubEnv(key, 'changed')
    const current = await collectIdentity(process.cwd())
    expect(() => assertIdentity(initial, current)).toThrow('变化字段：config')
  })

  it('锁竞争不能接管，释放时不能删除其他会话的锁', async () => {
    const { dir } = await setup()
    const release = await acquireLock('owner', dir)
    await expect(acquireLock('other', dir)).rejects.toThrow('占用')
    await release()
    const second = await acquireLock('second', dir)
    await expect(release()).rejects.toThrow('所有者改变')
    await second()
  })

  it.each(['local-full-platform-report.ts', 'demo-e2e-workflow.ts'])('%s 无报告时不会启动首个测试步骤', async (script) => {
    const root = fileURLToPath(new URL('../', import.meta.url))
    const result = await execa(process.execPath, ['--import', 'tsx', path.join(root, 'scripts', script), ...(script.startsWith('demo') ? ['--local'] : [])], {
      cwd: root,
      timeout: 30_000,
      reject: false,
    })
    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain('未启动测试子进程')
    expect(result.stdout).not.toContain('[local-full-report] quality:')
    expect(result.stdout).not.toContain('[demo-e2e] 1/')
  })

  it('失败报告明确记录原始阻塞', async () => {
    const { dir, session, report } = await setup()
    await expect(session.verify(report.identity)).rejects.toThrow()
    expect(await readFile(path.join(dir, 'report.md'), 'utf8')).toContain('全面测试已阻断')
  })
})
