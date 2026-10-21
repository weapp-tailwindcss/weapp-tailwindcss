import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { WechatEnvironmentError } from '../scripts/wechat/errors'
import { EnvironmentBlockedError } from './tailwind-capabilities/environment-block'
import { createStageBinding, processEnvironmentFailure, readStageReceipt, runStageProducer, stageBindingVariable } from './tailwind-capabilities/stage-receipt'

const roots: string[] = []
afterEach(async () => {
  vi.unstubAllEnvs()
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

async function fixture(target = 'react-native-ios') {
  const directory = await mkdtemp(path.join(tmpdir(), 'stage-receipt-'))
  roots.push(directory)
  const context = { root: directory, directory, runId: 'same-run' }
  const binding = createStageBinding(context, target)!
  vi.stubEnv(stageBindingVariable, JSON.stringify(binding))
  return { context, binding }
}

it('成功收尾后写入本次唯一终态，不能由其它同run调用代证', async () => {
  const { context, binding } = await fixture()
  const second = createStageBinding(context, binding.target)!
  expect(second.invocationId).not.toBe(binding.invocationId)
  expect(second.file).not.toBe(binding.file)
  await expect(runStageProducer('react-native', async () => 'done')).resolves.toBe('done')
  await expect(readStageReceipt(binding)).resolves.toBe('completed')
  await expect(readStageReceipt(second)).rejects.toThrow('终态回执缺失或无效')
})

it('普通语义失败写failed，环境故障经过收尾后仍写blocked并传播', async () => {
  const first = await fixture()
  await expect(runStageProducer('react-native', async () => {
    throw new Error('padding-right is missing')
  })).rejects.toThrow('padding-right')
  await expect(readStageReceipt(first.binding)).resolves.toBe('failed')
  const second = await fixture()
  let cleaned = false
  await expect(runStageProducer('react-native', async () => {
    try {
      throw new EnvironmentBlockedError('设备离线')
    }
    finally { cleaned = true }
  })).rejects.toThrow('设备离线')
  expect(cleaned).toBe(true)
  await expect(readStageReceipt(second.binding)).rejects.toThrow('设备离线')
})

it.each(['runId', 'target', 'invocationId', 'producer', 'file', 'version'] as const)('拒绝%s身份变更的回执', async (field) => {
  const { binding } = await fixture()
  await mkdir(path.dirname(binding.file), { recursive: true })
  await writeFile(binding.file, JSON.stringify({ ...binding, [field]: field === 'version' ? 2 : 'foreign', status: 'blocked', reason: '伪造环境原因' }))
  await expect(readStageReceipt(binding)).rejects.toThrow('终态回执缺失或无效')
})

it.each(['{}', '{', 'null', '{"status":"completed"}'])('拒绝截断、旧版或空回执 %s', async (source) => {
  const { binding } = await fixture()
  await mkdir(path.dirname(binding.file), { recursive: true })
  await writeFile(binding.file, source)
  await expect(readStageReceipt(binding)).rejects.toThrow('终态回执缺失或无效')
})

it('生产者不符或重复终态不能覆写已提交的回执', async () => {
  const { binding } = await fixture()
  const run = vi.fn(async () => {})
  await expect(runStageProducer('lynx-native', run)).rejects.toThrow('生产者')
  expect(run).not.toHaveBeenCalled()
  await runStageProducer('react-native', run)
  const before = await readFile(binding.file, 'utf8')
  await expect(runStageProducer('react-native', run)).rejects.toThrow('EEXIST')
  expect(await readFile(binding.file, 'utf8')).toBe(before)
})

it('无生产者的聚合目标没有宿主终态要求；独立入口正常执行', async () => {
  const { context } = await fixture()
  expect(createStageBinding(context, 'framework-regressions')).toBeUndefined()
  vi.stubEnv(stageBindingVariable, '')
  await expect(runStageProducer('react-native', async () => 42)).resolves.toBe(42)
})

it('启动和超时只接受Execa结构化错误，诊断文字不能冒充', () => {
  expect(processEnvironmentFailure(new Error('spawn pnpm ENOENT'))).toBeUndefined()
  expect(processEnvironmentFailure({ code: 'ENOENT' })).toBeUndefined()
  expect(processEnvironmentFailure({ isExecaError: true, code: 'ENOENT' })).toContain('ENOENT')
  expect(processEnvironmentFailure({ isExecaError: true, timedOut: true })).toContain('超时')
})

it('微信领域异常穿过多层收尾后仍写 blocked，不依赖认证文案', async () => {
  const { binding } = await fixture('weapp')
  const primary = new WechatEnvironmentError('domain-specific session fact')
  let error: Error = primary
  for (let index = 0; index < 100; index++) {
    error = new AggregateError([error, new Error('cleanup failed')], 'wrapper')
  }
  await expect(runStageProducer('weapp', async () => {
    throw error
  })).rejects.toBe(error)
  await expect(readStageReceipt(binding)).rejects.toThrow('domain-specific session fact')
})

it('回执写失败保留本轮原异常，不能被 EEXIST 覆盖', async () => {
  await fixture()
  await runStageProducer('react-native', async () => {})
  const primary = new EnvironmentBlockedError('真实设备离线')
  const error = await runStageProducer('react-native', async () => {
    throw primary
  }).catch(error => error)
  expect(error).toBeInstanceOf(AggregateError)
  expect(error.cause).toBe(primary)
  expect(error.errors).toMatchObject([primary, { code: 'EEXIST' }])
})
