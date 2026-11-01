import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { wechatResponseDetail } from '../scripts/wechat/errors'
import { assertWechatLogin, wechatRequest } from '../scripts/wechat/service'

describe('微信服务失败的安全诊断', () => {
  it.each([
    [401, {}, '认证或服务授权未确认'],
    [403, {}, '认证或服务授权未确认'],
    [500, { code: 'APPID_ERROR' }, '业务码=APPID_ERROR'],
    [500, { code: 'PROJECT_PATH_NOT_FOUND' }, '业务码=PROJECT_PATH_NOT_FOUND'],
    [500, { code: 'PROJECT_CONFIG_JSON_ERROR' }, '业务码=PROJECT_CONFIG_JSON_ERROR'],
    [500, { code: -1 }, '业务码=-1'],
    [200, undefined, '响应类型=undefined'],
    [200, [], '响应类型=数组'],
    [200, null, '响应类型=null'],
  ])('HTTP %s 仅保留有证据的安全分类', (status, result, expected) => {
    const detail = wechatResponseDetail(status as number, result)
    expect(detail).toContain(expected)
    if (status !== 401 && status !== 403) {
      expect(detail).toContain('不能据此判定认证失败')
    }
  })

  it.each(['sensitive-ticket', 1_234_567_890, Number.NaN, Number.POSITIVE_INFINITY, { nested: 'sensitive-ticket' }])('未知业务码不进入日志：%s', (code) => {
    const detail = wechatResponseDetail(500, { code, message: 'sensitive-ticket', stack: 'private-url', error: 'private-token' })
    expect(detail).not.toMatch(/业务码=|sensitive-ticket|private-url|private-token/)
  })

  let directory: string
  beforeEach(async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), 'weapp-wechat-diagnostic-'))
    vi.stubEnv('E2E_WECHAT_LOCK_DIRECTORY', directory)
  })
  afterEach(async () => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
    await rm(directory, { recursive: true, force: true })
  })

  it('登录查询通过后的 auto 500 仍阻断项目请求，同时保留阶段与安全码', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('{"login":true}'))
      .mockResolvedValueOnce(new Response(JSON.stringify({ code: 'PROJECT_PATH_NOT_FOUND', message: 'sensitive-ticket' }), { status: 500 }))
    const port = 32174
    const project = path.join(directory, 'owned-project')
    await assertWechatLogin(port)
    const error = await wechatRequest(port, { kind: 'auto', project, port: 32175 }).catch(error => error)
    expect(error).toMatchObject({ name: 'WechatEnvironmentError' })
    expect(error.message).toContain('auto 失败（HTTP 500，127.0.0.1:32174）')
    expect(error.message).toContain('业务码=PROJECT_PATH_NOT_FOUND')
    expect(error.message).toContain('不能据此判定认证失败')
    expect(error.message).not.toContain('sensitive-ticket')
    await expect(wechatRequest(port, { kind: 'close', project })).rejects.toThrow('停止后续')
    await expect(assertWechatLogin(port)).rejects.toThrow('停止后续')
    expect(fetch).toHaveBeenCalledTimes(2)
  })
})
