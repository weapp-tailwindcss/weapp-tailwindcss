import { rm } from 'node:fs/promises'
import process from 'node:process'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { runDemoE2eWorkflow } from '../scripts/demo-e2e-workflow'
import { enterFullTestGate, stageChecks } from '../scripts/e2e-preflight/gate'
import { collectIdentity } from '../scripts/e2e-preflight/io'
import { serve } from '../scripts/e2e-preflight/server'
import { PreflightSession } from '../scripts/e2e-preflight/session'
import { computerEvidence, fixtureSession, passingCheck } from './preflight-fixture'

const mocks = vi.hoisted(() => ({ runStep: vi.fn() }))
vi.mock('../scripts/demo-e2e-workflow/step', () => ({ runStep: mocks.runStep }))
const cleanups: Array<() => Promise<unknown>> = []
beforeEach(() => {
  mocks.runStep.mockReset()
  vi.stubEnv('E2E_PREFLIGHT_WECHAT_APPID', undefined)
  vi.stubEnv('E2E_TEMPLATE_IDE_APP_ID', undefined)
  vi.stubEnv('LYNX_IOS_DESTINATION', undefined)
})
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) {
    await cleanup()
  }
  vi.unstubAllEnvs()
})

async function prepared(appid?: string) {
  const fixture = await fixtureSession(await collectIdentity(process.cwd()))
  cleanups.push(() => rm(fixture.dir, { recursive: true, force: true }))
  const session = new PreflightSession(fixture.report, fixture.session.file, fixture.dir, async (id) => {
    const check = passingCheck(id)
    if (id === 'wechat') {
      delete check.binding!['appid']
      if (appid !== undefined) {
        check.binding!['appid'] = appid
      }
    }
    return check
  })
  const server = await serve(session)
  cleanups.push(() => server.close())
  await computerEvidence(session)
  await session.verify(fixture.report.identity)
  return session
}

it.each([undefined, 'wx1111111111111111'])('缺失或失配 AppID 的领取结果不能启动测试步骤：%s', async (appid) => {
  const session = await prepared(appid)
  await expect(runDemoE2eWorkflow(['--local', '--quality', '--preflight-report', session.file])).rejects.toThrow('AppID')
  expect(mocks.runStep).not.toHaveBeenCalled()
  expect(session.report.status).toBe('finished')
})

it('模板 IDE 阶段复查微信身份，领取后改变模板别名时零后续步骤', async () => {
  const appid = 'wx6ffee4673b257014'
  const session = await prepared(appid)
  const gate = await enterFullTestGate(session.file)
  try {
    expect(gate.env).toMatchObject({ E2E_PREFLIGHT_WECHAT_APPID: appid, E2E_TEMPLATE_IDE_APP_ID: appid })
    expect(stageChecks('extended template WeChat IDE runtime', true)).toContain('wechat')
    vi.stubEnv('E2E_TEMPLATE_IDE_APP_ID', 'wx1111111111111111')
    await expect(gate.check('extended template WeChat IDE runtime').then(mocks.runStep)).rejects.toThrow('变化字段：config')
    expect(mocks.runStep).not.toHaveBeenCalled()
  }
  finally {
    await gate.close()
  }
})
