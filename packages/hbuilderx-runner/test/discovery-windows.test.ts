import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { copyFile, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { expect, it } from 'vitest'
import { findRunningHBuilderXCliCandidates } from '../src/hbuilderx/discovery'

it.skipIf(process.platform !== 'win32')('真实 Windows 识别带特殊字符路径中的运行进程', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), '中文, 空格 & HBuilderX-'))
  const executable = path.join(directory, 'HBuilderX.exe')
  const cli = path.join(directory, 'cli.exe')
  await copyFile(process.execPath, executable)
  await writeFile(cli, '')
  const child = spawn(executable, ['-e', 'console.log("ready");setInterval(() => {}, 1000)'], { stdio: ['ignore', 'pipe', 'pipe'] })
  const closed = once(child, 'close')
  try {
    await once(child.stdout!, 'data')
    expect(await findRunningHBuilderXCliCandidates()).toContain(cli)
  }
  finally {
    child.kill()
    await closed
    await rm(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
  }
}, 60_000)
