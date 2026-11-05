import { Buffer } from 'node:buffer'
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { execa } from 'execa'
import { describe, expect, it } from 'vitest'
import { createWindowsOwnedProcess, stopWindowsOwnedProcess } from '../scripts/ci/windows-owned-process.mjs'

const workerPath = fileURLToPath(new URL('../scripts/ci/windows-owned-process.mjs', import.meta.url))

function worker(file: string, args: string[], options: Record<string, unknown> = {}) {
  return execa(process.execPath, [workerPath, '--owned-worker'], {
    ...options,
    env: {
      ...(options.env as Record<string, string>),
      WEAPP_WINDOWS_OWNED_COMMAND: Buffer.from(JSON.stringify({ file, args })).toString('base64'),
    },
  })
}

function isRunning(pid: number) {
  try {
    process.kill(pid, 0)
    return true
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ESRCH') {
      return false
    }
    throw error
  }
}

async function readPid(file: string) {
  try {
    return Number(await readFile(file, 'utf8'))
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return undefined
    }
    throw error
  }
}

async function waitFor(check: () => Promise<boolean> | boolean, message: string, timeout = 15_000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    if (await check()) {
      return
    }
    await delay(25)
  }
  throw new Error(message)
}

describe('Windows Job 命令桥接协议', () => {
  it('保留原始参数、工作目录、环境与 UTF-8 输出', async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), 'weapp owned 空格 '))
    const args = ['plain', 'two words', 'say "hello"', 'C:\\folder\\', '%PATH%', '(x)&y', '中文']
    try {
      const result = await worker(process.execPath, ['-e', 'console.log(JSON.stringify({args:process.argv.slice(1),cwd:process.cwd(),env:process.env.WEAPP_OWNED_TEST}));console.error("错误输出")', ...args], { cwd, env: { WEAPP_OWNED_TEST: '环境' } })
      expect(JSON.parse(result.stdout)).toEqual({ args, cwd: await realpath(cwd), env: '环境' })
      expect(result.stderr).toBe('错误输出')
    }
    finally {
      await rm(cwd, { recursive: true, force: true })
    }
  })

  it('将目标命令的失败和输出传回调用方', async () => {
    await expect(worker(process.execPath, ['-e', 'console.log("before failure");console.error("failed");process.exit(7)'])).rejects.toMatchObject({ exitCode: 7, stdout: 'before failure', stderr: 'failed' })
  })

  it('缺少命令身份时拒绝启动其他进程', async () => {
    await expect(execa(process.execPath, [workerPath, '--owned-worker'], { env: { WEAPP_WINDOWS_OWNED_COMMAND: '' } })).rejects.toMatchObject({ exitCode: 1, stderr: expect.stringContaining('缺少本轮 Windows 命令身份') })
  })

  it('拒绝回收其他入口创建的进程', async () => {
    await expect(stopWindowsOwnedProcess({ pid: process.pid })).rejects.toThrow('不属于本轮')
  })
})

describe.runIf(process.platform === 'win32')('Windows 原生 Job supervisor', () => {
  it('保留参数与输出，且自然结束后的多次收尾复用同一结果', async () => {
    const args = ['two words', 'say "hello"', 'C:\\folder\\', '%PATH%', '(x)&y', '中文']
    const child = createWindowsOwnedProcess(process.execPath, ['-e', 'console.log(JSON.stringify(process.argv.slice(1)))', ...args], { timeout: 15_000 })
    try {
      const result = await child
      expect(JSON.parse(result.stdout)).toEqual(args)
      const first = stopWindowsOwnedProcess(child)
      expect(stopWindowsOwnedProcess(child)).toBe(first)
      await first
    }
    finally {
      await stopWindowsOwnedProcess(child)
    }
  }, 20_000)

  it('通过 PATHEXT 保留原始 cmd 身份与 execa 对复杂参数的解释', async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), 'weapp owned cmd '))
    const command = path.join(cwd, 'owned wrapper.cmd')
    await writeFile(command, `@echo off\r\necho owned-cmd-identity\r\n"${process.execPath}" -e "console.log(JSON.stringify(process.argv.slice(1)))" %*\r\n`)
    const args = ['two words', 'say "hello"', 'C:\\folder\\', '%PATH%', '(x)&y', '中文']
    const options = { cwd, env: { PATH: `${cwd}${path.delimiter}${process.env.PATH}` }, timeout: 15_000, reject: false }
    const child = createWindowsOwnedProcess('owned wrapper', args, options)
    try {
      const reference = await execa('owned wrapper', args, options)
      const result = await child
      expect(reference.stdout).toContain('owned-cmd-identity')
      // 普通 cmd 的 %* 会再次解释参数；桥接必须与原有 execa 保持一致。
      expect({ exitCode: result.exitCode, stdout: result.stdout, stderr: result.stderr }).toEqual({ exitCode: reference.exitCode, stdout: reference.stdout, stderr: reference.stderr })
    }
    finally {
      await stopWindowsOwnedProcess(child)
      await rm(cwd, { recursive: true, force: true })
    }
  }, 20_000)

  it('保留原生命令的非零退出码和输出', async () => {
    const child = createWindowsOwnedProcess(process.execPath, ['-e', 'console.error("owned failure");process.exit(7)'], { timeout: 15_000 })
    try {
      await expect(child).rejects.toMatchObject({ exitCode: 7, stderr: 'owned failure' })
    }
    finally {
      await stopWindowsOwnedProcess(child)
    }
  }, 20_000)

  it('命令不存在时保留启动失败，并完成本轮 Job 收尾', async () => {
    const child = createWindowsOwnedProcess('weapp-owned-process-command-does-not-exist', [], { timeout: 15_000 })
    try {
      await expect(child).rejects.toMatchObject({ exitCode: 1, stderr: expect.stringContaining('ENOENT') })
    }
    finally {
      await stopWindowsOwnedProcess(child)
    }
  }, 20_000)

  it.each(['inherit', 'ignore'] as const)('包装进程先退出时回收 %s 输出的后代，并保留无关进程', async (stdio) => {
    const cwd = await mkdtemp(path.join(tmpdir(), 'weapp owned descendant '))
    const descendantFile = path.join(cwd, 'descendant.pid')
    const parentFile = path.join(cwd, 'parent.pid')
    const exitedFile = path.join(cwd, 'parent-exited')
    const descendantCode = `require('node:fs').writeFileSync(${JSON.stringify(descendantFile)}, String(process.pid));setInterval(()=>{},1000)`
    const parentCode = `require('node:fs').writeFileSync(${JSON.stringify(parentFile)}, String(process.pid));const child=require('node:child_process').spawn(process.execPath,['-e',${JSON.stringify(descendantCode)}],{stdio:${JSON.stringify(stdio)}});child.unref();child.once('spawn',()=>{require('node:fs').writeFileSync(${JSON.stringify(exitedFile)},'exited');process.exit(7)})`
    const unrelated = execa(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { stdio: 'ignore', reject: false })
    const child = createWindowsOwnedProcess(process.execPath, ['-e', parentCode], { timeout: 20_000 })
    try {
      await waitFor(async () => Boolean(await readPid(descendantFile)) && Boolean(await readPid(parentFile)), '本轮命令没有创建待回收后代')
      const descendant = (await readPid(descendantFile))!
      const parent = (await readPid(parentFile))!
      await waitFor(() => !isRunning(parent), '原包装进程没有先退出')
      expect(await readFile(exitedFile, 'utf8')).toBe('exited')
      expect(isRunning(descendant)).toBe(true)
      expect(child.exitCode).toBeNull()
      const started = Date.now()
      const stopped = stopWindowsOwnedProcess(child, { timeout: 5_000 })
      expect(stopWindowsOwnedProcess(child)).toBe(stopped)
      await stopped
      expect(Date.now() - started).toBeLessThan(5_000)
      await waitFor(() => !isRunning(descendant), '本轮 Job 后代未被回收', 2_000)
      expect(isRunning(unrelated.pid!)).toBe(true)
    }
    finally {
      try {
        await stopWindowsOwnedProcess(child)
      }
      finally {
        unrelated.kill('SIGKILL')
        try {
          await unrelated
        }
        finally {
          await rm(cwd, { recursive: true, force: true })
        }
      }
    }
  }, 25_000)
})
