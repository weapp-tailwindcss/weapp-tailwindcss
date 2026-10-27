import { copyFile, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { afterEach, expect, it, vi } from 'vitest'
import { spawnCommand } from '../../../packages/hbuilderx-runner/src/process'
import { launchGateEnvironment, prepareLocalCommandGate, prependNodePreload } from './launch-gate'

afterEach(() => vi.unstubAllEnvs())

it.each([
  { inherited: undefined, explicit: undefined, expected: '--max-old-space-size=8192' },
  { inherited: '--trace-warnings', explicit: undefined, expected: '--trace-warnings' },
  { inherited: '--trace-warnings', explicit: '', expected: '' },
  { inherited: '--trace-warnings', explicit: '--no-warnings', expected: '--no-warnings' },
])('保留 spawnCommand 的 NODE_OPTIONS 优先级 $expected', async ({ inherited, explicit, expected }) => {
  vi.stubEnv('NODE_OPTIONS', inherited)
  const gate = await prepareLocalCommandGate({ command: process.execPath, args: ['-e', 'console.log(process.env.NODE_OPTIONS)'], cwd: process.cwd(), env: { NODE_OPTIONS: explicit } })
  const command = spawnCommand(gate!.options)
  try {
    gate!.release()
    expect(await command.closed).toEqual({ code: 0, signal: null })
    expect(command.logs.join('').trim()).toBe(expected)
    expect(JSON.parse(gate!.options.env[launchGateEnvironment]).nodeOptions).toBe(expected)
  }
  finally {
    await command.stop()
    await gate!.close()
  }
})

it.each([
  ['/项目/preload with spaces.cjs', '--require="/项目/preload with spaces.cjs" '],
  ['C:\\项目\\preload with spaces.cjs', '--require="C:\\\\项目\\\\preload with spaces.cjs" '],
  ['\\\\server\\share\\preload.cjs', '--require="\\\\\\\\server\\\\share\\\\preload.cjs" '],
  ['./relative preload.cjs', '--require="./relative preload.cjs" '],
  ['/preload\twith\n"quote".cjs', '--require="/preload\twith\n\\"quote\\".cjs" '],
])('Node 参数引号保留路径 %s', (input, expected) => {
  expect(prependNodePreload(input, '')).toBe(expected)
})

it('父侧未放行且期限耗尽时 preload 自行失败，不执行用户入口', async () => {
  const gate = await prepareLocalCommandGate({ command: process.execPath, args: ['-e', 'console.log("must not execute")'], cwd: process.cwd(), env: { NODE_OPTIONS: '' } })
  const payload = JSON.parse(gate!.options.env[launchGateEnvironment])
  const command = spawnCommand({ ...gate!.options, env: { ...gate!.options.env, [launchGateEnvironment]: JSON.stringify({ ...payload, deadline: Date.now() - 1 }) } })
  try {
    expect(await command.closed).toEqual({ code: 1, signal: null })
    expect(command.logs.join('')).toContain('等待启动身份登记超过截止时间')
    expect(command.logs.join('')).not.toContain('must not execute')
  }
  finally {
    await command.stop()
    await gate!.close()
  }
})

it('原生 Node 在包含空格、中文与平台允许特殊字符的路径加载 gate preload', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'website gate path 中文 & '))
  const name = process.platform === 'win32' ? 'preload 中文 with spaces.cjs' : 'preload "quote" \\ newline\n tab\t.cjs'
  const preload = path.join(root, name)
  await copyFile(fileURLToPath(new URL('./launch-gate-preload.cjs', import.meta.url)), preload)
  const gate = await prepareLocalCommandGate({ command: process.execPath, args: ['-e', 'console.log("loaded")'], cwd: root, env: { NODE_OPTIONS: '' } })
  const command = spawnCommand({ ...gate!.options, env: { ...gate!.options.env, NODE_OPTIONS: prependNodePreload(preload, '') } })
  try {
    gate!.release()
    expect(await command.closed, command.logs.join('')).toEqual({ code: 0, signal: null })
    expect(command.logs.join('').trim()).toBe('loaded')
  }
  finally {
    await command.stop()
    await gate!.close()
    await rm(root, { recursive: true, force: true })
  }
})
