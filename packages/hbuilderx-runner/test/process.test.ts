import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { expect, it, vi } from 'vitest'
import { runCommand, spawnCommand } from '../src/process'

it.skipIf(process.platform === 'win32')('超时后等待宽限退出和日志关闭，保留真实零退出码及 timeout 分类', async () => {
  const result = await runCommand({
    command: process.execPath,
    args: ['-e', 'process.on("SIGTERM", () => setTimeout(() => { console.log("CLEANED"); process.exit(0) }, 100)); console.log("READY"); setTimeout(() => process.exit(2), 3000)'],
    cwd: process.cwd(),
    timeoutMs: 700,
    allowFailure: true,
  })
  expect(result.issue.kind).toBe('timeout')
  expect(result.output).toContain('CLEANED')
  expect(result.exit).toEqual({ code: 0, signal: null })
})

it('stop 强制终止拒绝 SIGTERM 的子进程，只有收到 close 才返回', async () => {
  const spawned = spawnCommand({
    command: process.execPath,
    args: ['-e', 'process.on("SIGTERM", () => {}); console.log("READY"); setTimeout(() => process.exit(2), 12000)'],
    cwd: process.cwd(),
  })
  let closed = false
  void spawned.closed.then(() => {
    closed = true
  })
  try {
    await vi.waitFor(() => expect(spawned.logs.join('')).toContain('READY'), { timeout: 5000 })
    await spawned.stop()
    expect(closed).toBe(true)
  }
  finally {
    if (!closed) {
      spawned.child.kill('SIGKILL')
      await vi.waitFor(() => expect(closed).toBe(true), { timeout: 3000 })
    }
  }
})

it('原生可执行文件不存在时返回带命令和 cwd 的分类错误', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'hbuilderx-missing-'))
  const command = path.join(root, 'missing-cli.exe')
  try {
    await expect(runCommand({ command, args: [], cwd: root, timeoutMs: 5000 })).rejects.toMatchObject({
      name: 'HBuilderXCommandError',
      result: { command, cwd: root, issue: { kind: 'cli-not-found' } },
    })
  }
  finally {
    await rm(root, { recursive: true, force: true })
  }
})

it('保留原生进程的参数边界，包括空格、中文、反斜杠与 shell 字符', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'hbuilderx 参数 & 边界-'))
  const file = path.join(root, '读取 参数.cjs')
  const args = ['中文 空格', 'C:\\项目目录\\', 'a&b', '(value)', 'quote"value', '', 'a|b', '%PATH%']
  try {
    await writeFile(file, 'process.stdout.write(JSON.stringify(process.argv.slice(2)))')
    const result = await runCommand({
      command: process.execPath,
      args: [file, ...args],
      cwd: root,
      timeoutMs: 5000,
    })
    expect(JSON.parse(result.output)).toEqual(args)
  }
  finally {
    await rm(root, { recursive: true, force: true })
  }
})

it.skipIf(process.platform !== 'win32')('通过 PATH 运行带空格目录中的 cmd shim，并保留参数', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'hbuilderx shim & 中文-'))
  try {
    const file = path.join(root, 'arguments.cjs')
    await writeFile(file, 'process.stdout.write(JSON.stringify(process.argv.slice(2)))')
    await writeFile(path.join(root, 'hx-test.cmd'), '@echo off\r\n"%HX_TEST_NODE%" "%~dp0arguments.cjs" %*\r\n')
    const args = ['中文 空格', 'C:\\目录\\', 'a&b', '(value)', '', 'a|b', '%PATH%']
    const result = await runCommand({
      command: 'hx-test',
      args,
      cwd: root,
      env: { PATH: root, HX_TEST_NODE: process.execPath },
      timeoutMs: 5000,
    })
    expect(JSON.parse(result.output)).toEqual(args)
  }
  finally {
    await rm(root, { recursive: true, force: true })
  }
})

it.skipIf(process.platform === 'win32')('根进程退出后仍清理忽略 TERM 且关闭管道的真实后代', async () => {
  const leaf = 'process.on("SIGTERM", () => {}); console.log(process.pid); process.stdout.end(); setTimeout(() => process.exit(2), 12000)'
  const script = `
    const { spawn } = require('node:child_process')
    const child = spawn(process.execPath, ['-e', ${JSON.stringify(leaf)}], { stdio: ['ignore', 'pipe', 'ignore'] })
    process.on('SIGTERM', () => process.exit(0))
    child.stdout.on('data', chunk => console.log('LEAF=' + chunk.toString().trim()))
    setTimeout(() => process.exit(2), 12000)
  `
  const owned = spawnCommand({ command: process.execPath, args: ['-e', script], cwd: process.cwd() })
  const group = owned.child.pid!
  const groupGone = () => {
    try {
      process.kill(-group, 0)
      return false
    }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ESRCH') {
        return true
      }
      throw error
    }
  }
  try {
    await vi.waitFor(() => expect(owned.logs.join('')).toMatch(/LEAF=\d+/), { timeout: 5000 })
    const stopped = owned.stop()
    expect(await owned.closed).toEqual({ code: 0, signal: null })
    expect(groupGone()).toBe(false)
    await stopped
    expect(groupGone()).toBe(true)
  }
  finally {
    if (!groupGone()) {
      process.kill(-group, 'SIGKILL')
      await vi.waitFor(() => expect(groupGone()).toBe(true), { timeout: 3000 })
    }
  }
})
