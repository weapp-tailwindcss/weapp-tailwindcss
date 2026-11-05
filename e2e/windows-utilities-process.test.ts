import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { setTimeout as delay } from 'node:timers/promises'
import { describe, expect, it } from 'vitest'
import { createOwnedProcess, runCommandWithProcessTree, settleOwnedProcess, stopProcessTree } from '../scripts/ci/windows-utilities-process.mjs'

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

describe('Windows utilities 进程树边界', () => {
  it('保留命令成功输出', async () => {
    const result = await runCommandWithProcessTree(process.execPath, ['-e', 'console.log("done")'])
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toBe('done')
  })

  it('保留命令失败及其输出', async () => {
    await expect(runCommandWithProcessTree(process.execPath, ['-e', 'console.error("failed"); process.exit(7)'])).rejects.toMatchObject({ exitCode: 7, stderr: 'failed' })
  })

  it.each([false, true])('回收包装进程和持有输出管道的后代，包装提前退出与忽略 TERM：%s', async (earlyExit) => {
    const root = await mkdtemp(path.join(tmpdir(), 'weapp-utilities-process-'))
    const parentFile = path.join(root, 'parent.pid')
    const childFile = path.join(root, 'child.pid')
    const childCode = `${earlyExit ? 'process.on("SIGTERM", () => {});' : ''} require('node:fs').writeFileSync(${JSON.stringify(childFile)}, String(process.pid)); setInterval(() => {}, 1000)`
    // Windows 后代必须脱离父 Node 的 libuv Job，才能验证包装根退出后的外层 Job 归属。
    const parentCode = `const fs=require('node:fs');fs.writeFileSync(${JSON.stringify(parentFile)}, String(process.pid));const child=require('node:child_process').spawn(process.execPath, ['-e', ${JSON.stringify(childCode)}], { detached: ${process.platform === 'win32'}, stdio: 'inherit' });child.unref();${earlyExit ? `const ready=setInterval(()=>{if(fs.existsSync(${JSON.stringify(childFile)})){clearInterval(ready);process.exit(0)}},10)` : 'setInterval(() => {}, 1000)'}`
    const unrelated = createOwnedProcess(process.execPath, ['-e', 'setInterval(() => {}, 1000)'])
    void unrelated.catch(() => {})
    const readPid = async (file: string) => {
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
    const cleanOwnedProcesses = async () => {
      for (const file of [childFile, parentFile]) {
        const pid = await readPid(file)
        if (pid && isRunning(pid)) {
          try {
            process.kill(pid, 'SIGKILL')
          }
          catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ESRCH') {
              throw error
            }
          }
        }
      }
    }
    let rescueUsed = false
    const rescue = setTimeout(() => {
      rescueUsed = true
      void cleanOwnedProcesses()
    }, 15_000)
    try {
      const command = runCommandWithProcessTree(process.execPath, ['-e', parentCode], { timeout: 5_000 })
      let settled = false
      void command.then(() => {
        settled = true
      }, () => {
        settled = true
      })
      if (earlyExit) {
        const deadline = Date.now() + 4_000
        let parent: number | undefined
        let descendant: number | undefined
        while (Date.now() < deadline) {
          parent = await readPid(parentFile)
          descendant = await readPid(childFile)
          if (parent && descendant && !isRunning(parent) && isRunning(descendant)) {
            break
          }
          await delay(25)
        }
        expect(parent, '包装根必须实际启动并记录身份').toBeTypeOf('number')
        expect(descendant, '后代必须写入 ready 标识后才允许包装根退出').toBeTypeOf('number')
        expect(isRunning(parent!), '必须先确认包装根已经退出').toBe(false)
        expect(isRunning(descendant!), '包装根退出后后代必须继续存活').toBe(true)
        expect(settled, '拥有的进程入口仍须等待存活后代').toBe(false)
      }
      await expect(command).rejects.toThrow(/timed out after 5000 milliseconds/)
      expect(rescueUsed, '命令必须在自身超时回收中结束，不能依赖测试救援清理').toBe(false)
      const parent = await readPid(parentFile)
      const child = await readPid(childFile)
      expect(parent).toBeTypeOf('number')
      expect(child).toBeTypeOf('number')
      for (let attempt = 0; attempt < 60 && (isRunning(parent!) || isRunning(child!)); attempt++) {
        await delay(50)
      }
      expect(isRunning(parent!)).toBe(false)
      expect(isRunning(child!)).toBe(false)
      expect(isRunning(unrelated.pid!), '无关进程不能因名称相同被回收').toBe(true)
    }
    finally {
      clearTimeout(rescue)
      await cleanOwnedProcesses()
      await stopProcessTree(unrelated)
      await settleOwnedProcess(unrelated)
      await rm(root, { recursive: true, force: true })
    }
  }, 20_000)

  it('对同一拥有的进程复用收尾，不再信号已结束的数字进程组', async () => {
    const child = createOwnedProcess(process.execPath, ['-e', 'setInterval(() => {}, 1000)'])
    void child.catch(() => {})
    const stopping = stopProcessTree(child)
    expect(stopProcessTree(child)).toBe(stopping)
    await stopping
    expect(stopProcessTree(child)).toBe(stopping)
    await settleOwnedProcess(child)
  })
})
