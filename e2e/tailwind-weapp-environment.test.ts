import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { closeWechatProject } from '../scripts/wechat-project-cleanup'
import { persistReport } from './tailwind-capabilities/context'
import { EnvironmentBlockedError, findEnvironmentBlock } from './tailwind-capabilities/environment-block'
import { withGeneratorFixture } from './tailwind-capabilities/fixture'
import { writeCapabilityReport } from './tailwind-capabilities/report'
import { runWeapp } from './tailwind-capabilities/weapp'

const { launch, setData, mini } = vi.hoisted(() => {
  const setData = vi.fn()
  const mini = { reLaunch: vi.fn(async () => ({ setData })) }
  return { launch: vi.fn(async () => mini), setData, mini }
})
vi.mock('../scripts/wechat/automator', () => ({ Launcher: class { launch = launch } }))
vi.mock('../scripts/wechat-project-cleanup', () => ({ closeWechatProject: vi.fn(async () => {}) }))
vi.mock('./tailwind-capabilities/context', () => ({ newReport: vi.fn(async () => ({ results: [], environment: {}, artifacts: [], identity: {} })), persistReport: vi.fn(async () => {}) }))
vi.mock('./tailwind-capabilities/fixture', () => ({ withGeneratorFixture: vi.fn(async () => ({ css: '.fixture{}' })) }))
vi.mock('./tailwind-capabilities/report', () => ({
  assertionPassed: vi.fn(),
  receipt: vi.fn(async (_file: string, _root: string, _runId: string, caseIds: string[]) => ({ path: 'generated.wxss', caseIds })),
  validateCapabilityReport: vi.fn(),
  verifyReportArtifacts: vi.fn(),
  writeCapabilityReport: vi.fn(async () => {}),
}))

const roots: string[] = []
beforeEach(() => vi.clearAllMocks())
afterEach(async () => {
  vi.mocked(closeWechatProject).mockReset().mockResolvedValue(undefined)
  launch.mockReset().mockResolvedValue(mini)
  setData.mockReset()
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})
async function context() {
  const directory = await mkdtemp(path.join(tmpdir(), 'tailwind-weapp-environment-'))
  roots.push(directory)
  return { root: directory, directory, runId: 'weapp-environment', caseFilter: /^(?:width|height)-arbitrary$/, env: {} }
}

it('真实环境异常立即停止剩余微信案例，清理和报告落盘后仍传播原异常', async () => {
  const failure = new EnvironmentBlockedError('微信 IDE 登录未确认')
  setData.mockRejectedValue(failure)
  await expect(runWeapp(await context())).rejects.toBe(failure)
  expect(setData).toHaveBeenCalledOnce()
  expect(closeWechatProject).toHaveBeenCalledOnce()
  const report = vi.mocked(writeCapabilityReport).mock.calls[0]![1]
  expect(report.results).toMatchObject([{ id: 'width-arbitrary', status: 'blocked' }, { id: 'height-arbitrary', status: 'blocked' }])
  expect(persistReport).not.toHaveBeenCalled()
})

it('终态 SDK 协议超时阻断剩余案例，不根据相同错误文字把它记为样式失败', async () => {
  const failure = Object.assign(new Error('opaque SDK timeout'), { code: 'DEVTOOLS_PROTOCOL_TIMEOUT', method: 'Page.setData' })
  setData.mockRejectedValue(failure)
  await expect(runWeapp(await context())).rejects.toBe(failure)
  expect(setData).toHaveBeenCalledOnce()
  expect(closeWechatProject).toHaveBeenCalledOnce()
  expect(vi.mocked(writeCapabilityReport).mock.calls[0]![1].results.map(result => result.status)).toEqual(['blocked', 'blocked'])
  expect(findEnvironmentBlock(failure)).toMatchObject({ cause: { cause: failure } })
})

it('认证失败和收尾失败保留原阻塞，不能被覆盖为样式断言', async () => {
  const failure = new EnvironmentBlockedError('本轮认证失败')
  const cleanup = new Error('项目清理失败')
  setData.mockRejectedValue(failure)
  vi.mocked(closeWechatProject).mockRejectedValue(cleanup)
  const error = await runWeapp(await context()).catch(error => error)
  expect(error).toBeInstanceOf(AggregateError)
  expect(error.cause).toBe(failure)
  expect(error.errors).toMatchObject([failure, { name: 'EnvironmentBlockedError', cause: cleanup }])
  expect(writeCapabilityReport).toHaveBeenCalledOnce()
})

it('认证、项目清理和报告写入同时失败，所有原异常仍可追溯', async () => {
  const primary = new EnvironmentBlockedError('微信登录未确认')
  const cleanup = new Error('项目清理失败')
  const disk = new Error('报告写入失败')
  setData.mockRejectedValue(primary)
  vi.mocked(closeWechatProject).mockRejectedValue(cleanup)
  vi.mocked(writeCapabilityReport).mockRejectedValueOnce(disk)
  const error = await runWeapp(await context()).catch(error => error)
  expect(error.cause).toBe(primary)
  expect(error.errors[1].errors).toMatchObject([{ cause: cleanup }, disk])
  expect(findEnvironmentBlock(error)).toBeDefined()
  expect(setData).toHaveBeenCalledOnce()
})

it('启动失败不再次清理 Launcher 尚未移交的会话', async () => {
  const primary = new EnvironmentBlockedError('启动认证未确认')
  launch.mockRejectedValueOnce(primary)
  await expect(runWeapp(await context())).rejects.toBe(primary)
  expect(closeWechatProject).not.toHaveBeenCalled()
  expect(writeCapabilityReport).toHaveBeenCalledOnce()
})

it('收尾单独失败也阻断，但保留已采集的案例结果和原异常', async () => {
  setData.mockRejectedValue(new Error('普通页面语义错误'))
  const primary = new Error('项目关闭未确认')
  vi.mocked(closeWechatProject).mockRejectedValue(primary)
  const error = await runWeapp(await context()).catch(error => error)
  expect(findEnvironmentBlock(error)).toMatchObject({ cause: primary })
  expect(vi.mocked(writeCapabilityReport).mock.calls[0]![1].results.map(result => result.status)).toEqual(['failed', 'failed'])
})

it('普通页面语义错误继续收集其它案例，不伪装为环境阻断', async () => {
  setData.mockRejectedValue(new Error('目标节点缺少宽度'))
  const report = await runWeapp(await context())
  expect(setData).toHaveBeenCalledTimes(2)
  expect(report.results.map(result => result.status)).toEqual(['failed', 'failed'])
  expect(closeWechatProject).toHaveBeenCalledOnce()
})

it('样式生成异常记录 failed 并传播原错，不冒充环境问题或启动 IDE', async () => {
  const primary = new Error('Tailwind generation failed')
  vi.mocked(withGeneratorFixture).mockRejectedValueOnce(primary)
  await expect(runWeapp(await context())).rejects.toBe(primary)
  expect(launch).not.toHaveBeenCalled()
  expect(closeWechatProject).not.toHaveBeenCalled()
  expect(vi.mocked(writeCapabilityReport).mock.calls[0]![1].results.map(result => result.status)).toEqual(['failed', 'failed'])
})
