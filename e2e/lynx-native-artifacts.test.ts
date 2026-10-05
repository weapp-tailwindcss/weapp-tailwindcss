import type { NativeRunStage } from './lynx/native-artifacts'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { afterEach, expect, it, vi } from 'vitest'
import { formatNativeFailure, withNativeArtifacts } from './lynx/native-artifacts'
import { command } from './lynx/native-command'

const directories: string[] = []
afterEach(async () => {
  await Promise.all(directories.splice(0).map(directory => fs.rm(directory, { recursive: true, force: true })))
})

async function artifactDirectory() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'lynx-failure-artifacts-'))
  directories.push(directory)
  return path.join(directory, 'artifacts')
}

it('设备发现期真实子进程超时也保留原始错误和结构化诊断', async () => {
  const directory = await artifactDirectory()
  const run = withNativeArtifacts('ios', directory, async () => {
    expect((await fs.stat(directory)).isDirectory()).toBe(true)
    return command(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], directory, 500)
  })
  await expect(run).rejects.toMatchObject({ timedOut: true })
  const report = JSON.parse(await fs.readFile(path.join(directory, 'failure.json'), 'utf8'))
  expect(report).toMatchObject({ platform: 'ios', stage: 'device-discovery', error: { timedOut: true, message: expect.stringContaining('timed out') } })
  expect(Date.parse(report.startedAt)).toBeLessThanOrEqual(Date.parse(report.failedAt))
  expect(await fs.readFile(path.join(directory, 'failure.txt'), 'utf8')).toContain('timed out')
}, 10_000)

it.each<NativeRunStage>(['host-preparation', 'bundle-build', 'bundle-staging', 'native-run', 'report-validation'])('%s 失败保留阶段、已采集证据和原错误，不展开命令环境', async (stage) => {
  const directory = await artifactDirectory()
  const failure = Object.assign(new Error('native command failed'), { exitCode: 7, env: { TEST_SECRET: 'not-for-artifacts' } })
  await expect(withNativeArtifacts('android', directory, async (setStage) => {
    await fs.writeFile(path.join(directory, 'device.json'), '{"id":"selected-device"}')
    setStage(stage)
    throw failure
  })).rejects.toBe(failure)
  const source = await fs.readFile(path.join(directory, 'failure.json'), 'utf8')
  expect(JSON.parse(source)).toMatchObject({ platform: 'android', stage, error: { exitCode: 7 } })
  expect(source).not.toContain('not-for-artifacts')
  expect(await fs.readFile(path.join(directory, 'device.json'), 'utf8')).toBe('{"id":"selected-device"}')
})

it('部分证据写入失败同时保留主体错误与写入错误', async () => {
  const directory = await artifactDirectory()
  const failure = new Error('first native failure')
  const run = withNativeArtifacts('ios', directory, async () => {
    await fs.mkdir(path.join(directory, 'failure.txt'))
    throw failure
  })
  await expect(run).rejects.toMatchObject({ errors: [failure, expect.objectContaining({ code: expect.any(String) })] })
  expect(JSON.parse(await fs.readFile(path.join(directory, 'failure.json'), 'utf8')).error.message).toBe(failure.message)
})

it('证据目录无法建立时不调度设备命令', async () => {
  const directory = await artifactDirectory()
  await fs.writeFile(directory, 'occupied')
  const run = vi.fn()
  await expect(withNativeArtifacts('ios', directory, run)).rejects.toMatchObject({ code: 'EEXIST' })
  expect(run).not.toHaveBeenCalled()
})

it('两份证据都写入失败时 CLI 仍显示原命令及写入错误', async () => {
  const directory = await artifactDirectory()
  const failure = Object.assign(new Error('simctl discovery failed'), { code: 'ETIMEDOUT', env: { TEST_SECRET: 'not-for-cli' } })
  const result = await withNativeArtifacts('ios', directory, async () => {
    await Promise.all(['failure.txt', 'failure.json'].map(name => fs.mkdir(path.join(directory, name))))
    throw failure
  }).then(() => undefined, error => error)
  expect(result).toBeInstanceOf(AggregateError)
  expect(result.errors).toHaveLength(3)
  const output = formatNativeFailure(result)
  expect(output).toContain('simctl discovery failed')
  expect(output).toContain('ETIMEDOUT')
  expect(output).toContain('failure.txt')
  expect(output).toContain('failure.json')
  expect(output).not.toContain('not-for-cli')
})

it('异常 cause 的循环不会遮蔽原错或阻止格式化', () => {
  const failure = new Error('original failure')
  failure.cause = failure
  const output = formatNativeFailure(failure)
  expect(output).toContain('original failure')
  expect(output).toContain('重复引用的异常')
})

it('正常返回不生成失败记录', async () => {
  const directory = await artifactDirectory()
  await expect(withNativeArtifacts('ios', directory, async () => 'complete')).resolves.toBe('complete')
  expect(await fs.readdir(directory)).toEqual([])
})

it('已有成功报告的目录不能在设备发现或构建前被新运行复用', async () => {
  const directory = await artifactDirectory()
  await fs.mkdir(directory)
  const previous = '{"runId":"previous-success"}'
  await fs.writeFile(path.join(directory, 'report.json'), previous)
  await fs.writeFile(path.join(directory, 'run-context.json'), previous)
  const run = vi.fn(async () => {
    throw new Error('new bundle preparation failed')
  })
  await expect(withNativeArtifacts('android', directory, run)).rejects.toMatchObject({ code: 'EEXIST' })
  expect(run).not.toHaveBeenCalled()
  expect(await fs.readFile(path.join(directory, 'report.json'), 'utf8')).toBe(previous)
  expect(await fs.readdir(directory)).toEqual(['report.json', 'run-context.json'])
})
