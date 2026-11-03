import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { wechatResponseDetail } from '../scripts/wechat/errors'
import { assertWechatLogin, wechatRequest } from '../scripts/wechat/service'

describe('微信服务失败的安全诊断', () => {
  const loginRequiredMessage = 'Error: 错误 Error: 需要重新登录, [20261001 01:02:03] (code 10)'

  it.each(['', '\nError: private-ticket\n    at private-stack', '\r\nError: private-ticket'])('识别官方包装的项目认证错误，不回显正文：%j', (suffix) => {
    const detail = wechatResponseDetail(500, { code: 10, message: `${loginRequiredMessage}${suffix}` })
    expect(detail).toContain('项目接口返回需要重新登录类认证错误')
    expect(detail).toContain('这不代表 IDE 未登录')
    expect(detail).not.toMatch(/private-ticket|private-stack|20261001|01:02:03/)
  })

  it.each([
    [500, '10', loginRequiredMessage],
    [500, 11, loginRequiredMessage],
    [200, 10, loginRequiredMessage],
    [500, 10, `日志：${loginRequiredMessage}`],
    [500, 10, `${loginRequiredMessage} private-ticket`],
    [500, 10, `Error: unrelated\n    at ${loginRequiredMessage}`],
    [500, 10, { nested: loginRequiredMessage }],
    [500, 10, undefined],
  ])('不把相似正文或其他业务码当成项目认证错误', (status, code, message) => {
    const detail = wechatResponseDetail(status as number, { code, message })
    expect(detail).toContain('不能据此判定认证失败')
    expect(detail).not.toMatch(/项目接口返回需要重新登录类认证错误|private-ticket|20261001/)
  })

  it('HTTP 认证状态优先于包装正文分类', () => {
    expect(wechatResponseDetail(401, { code: 10, message: loginRequiredMessage })).toContain('认证或服务授权未确认')
  })

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

  it('登录查询通过后项目认证仍可失败，准确提示并停止后续请求', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('{"login":true}'))
      .mockResolvedValueOnce(new Response(JSON.stringify({ code: 10, message: `${loginRequiredMessage}\nError: private-ticket\n    at private-stack` }), { status: 500 }))
    const port = 32184
    const project = path.join(directory, 'owned-project')
    await assertWechatLogin(port)
    await expect(wechatRequest(port, { kind: 'auto', project, port: 32185 })).rejects.toThrow('项目接口返回需要重新登录类认证错误')
    await expect(wechatRequest(port, { kind: 'close', project })).rejects.toThrow('停止后续')
    await expect(assertWechatLogin(port)).rejects.toThrow('停止后续')
    expect(fetch).toHaveBeenCalledTimes(2)
  })
})
