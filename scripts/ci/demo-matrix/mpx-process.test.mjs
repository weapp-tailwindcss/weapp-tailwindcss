import { copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { execa } from 'execa'
import { expect, it } from 'vitest'
import { repo } from './catalog.mjs'

it.each([0, 7])('Mpx 子进程退出 %s 后不保留伪存活的 watch 包装进程', async (code) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'mpx-process-'))
  try {
    const bin = path.join(directory, 'node_modules', '@mpxjs', 'mpx-cli-service', 'bin')
    await mkdir(bin, { recursive: true })
    await writeFile(path.join(bin, 'mpx-cli-service.js'), `process.exit(${code})`)
    const wrapper = path.join(directory, 'wrapper.cjs')
    await copyFile(path.join(repo, 'demo', 'mpx-tailwindcss-v4', 'scripts', 'run-mpx-cli-service.js'), wrapper)
    const result = await execa(process.execPath, [wrapper, 'serve'], {
      cwd: directory,
      env: { WEAPP_TW_WATCH_REGRESSION: '1' },
      reject: false,
      timeout: 2000,
    })
    expect(result.timedOut).toBe(false)
    expect(result.exitCode).toBe(code)
  }
  finally { await rm(directory, { recursive: true, force: true }) }
})
