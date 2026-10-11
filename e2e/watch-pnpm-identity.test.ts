import type { ChildProcess } from 'node:child_process'
import { chmod, copyFile, link, mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { spawnPnpm } from '../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/session'

const roots: string[] = []

afterEach(async () => {
  vi.unstubAllEnvs()
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

async function fixture() {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'watch pnpm identity ')))
  roots.push(root)
  const bin = path.join(root, 'bin')
  const active = path.join(root, 'active cli', 'pnpm.cjs')
  const project = path.join(root, 'nested demo')
  await Promise.all([bin, path.dirname(active), project].map(dir => mkdir(dir)))
  await writeFile(path.join(root, 'package.json'), JSON.stringify({ packageManager: 'pnpm@99.1.0' }))
  await writeFile(path.join(project, 'package.json'), JSON.stringify({ packageManager: 'pnpm@99.2.0' }))
  await writeFile(active, 'process.stdout.write(JSON.stringify({ version: "99.1.0", args: process.argv.slice(2), cwd: process.cwd() }))')
  // 模拟 Corepack 按子项目 manifest 重新选择版本，避免依赖本机缓存或联网下载。
  const shim = path.join(bin, 'dispatch.cjs')
  await writeFile(shim, 'const fs = require("node:fs"); const path = require("node:path"); const version = JSON.parse(fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8")).packageManager.slice(5); process.stdout.write(JSON.stringify({ version, args: process.argv.slice(2), cwd: process.cwd() }))')
  if (process.platform === 'win32') {
    await writeFile(path.join(bin, 'pnpm.cmd'), `@"${process.execPath}" "${shim}" %*\r\n`)
  }
  else {
    const command = path.join(bin, 'pnpm')
    await writeFile(command, '#!/usr/bin/env node\nrequire("./dispatch.cjs")\n')
    await chmod(command, 0o755)
  }
  const env: NodeJS.ProcessEnv = { ...process.env, PATH: [bin, path.dirname(process.execPath), process.env['PATH']].filter(Boolean).join(path.delimiter) }
  vi.stubEnv('PATH', env['PATH'])
  return { active, project, env }
}

async function result(child: ChildProcess) {
  let stdout = ''
  let stderr = ''
  child.stdout!.on('data', chunk => stdout += chunk.toString())
  child.stderr!.on('data', chunk => stderr += chunk.toString())
  const timer = setTimeout(() => child.kill(), 10_000)
  try {
    const code = await new Promise<number | null>((resolve, reject) => {
      child.once('error', reject)
      child.once('close', resolve)
    })
    expect({ code, stderr }).toEqual({ code: 0, stderr: '' })
    return JSON.parse(stdout)
  }
  finally {
    clearTimeout(timer)
  }
}

describe('watch 子进程保留已选择的 pnpm 身份', () => {
  it('切到声明另一版本的 demo 后仍执行当前 pnpm CLI，并原样传递参数', async () => {
    const { active, project, env } = await fixture()
    const args = ['--probe', '空 格', 'quote"and$literal']
    const actual = await result(spawnPnpm(args, { cwd: project, env: { ...env, npm_execpath: active }, stdio: 'pipe' }))
    expect(actual).toEqual({ version: '99.1.0', args, cwd: project })
  })

  it('没有活动 pnpm CLI 的独立调用保留 PATH 选择，不继承另一调用者的 CLI', async () => {
    const { active, project, env } = await fixture()
    vi.stubEnv('npm_execpath', active)
    const standalone = { ...env }
    delete standalone['npm_execpath']
    const actual = await result(spawnPnpm(['--version'], { cwd: project, env: standalone, stdio: 'pipe' }))
    expect(actual).toEqual({ version: '99.2.0', args: ['--version'], cwd: project })
  })

  it('当前 CLI 为原生二进制时直接运行它，不调用 PATH 中的版本分派器', async () => {
    const { active, project, env } = await fixture()
    const native = path.join(path.dirname(active), process.platform === 'win32' ? 'pnpm-native.exe' : 'pnpm-native')
    // 使用真实可执行文件验证分派，不安装额外包管理器或依赖全局 Corepack 缓存。
    await link(process.execPath, native).catch(() => copyFile(process.execPath, native))
    const actual = await result(spawnPnpm(['-e', 'process.stdout.write(JSON.stringify({ native: true, cwd: process.cwd() }))'], {
      cwd: project,
      env: { ...env, npm_execpath: native },
      stdio: 'pipe',
    }))
    expect(actual).toEqual({ native: true, cwd: project })
  })

  it('无扩展名 Node shebang 入口通过当前 Node 执行', async () => {
    const { active, project, env } = await fixture()
    const script = path.join(path.dirname(active), 'pnpm')
    await writeFile(script, '#!/usr/bin/env node\nprocess.stdout.write(JSON.stringify({ node: process.execPath, cwd: process.cwd() }))')
    // 不赋予执行权限，验证入口确实由 Node 加载而不是依赖直接执行成功。
    const actual = await result(spawnPnpm([], { cwd: project, env: { ...env, npm_execpath: script }, stdio: 'pipe' }))
    expect(actual).toEqual({ node: process.execPath, cwd: project })
  })

  it('显式指定但已缺失的 CLI 报错，不回退到另一版本', async () => {
    const { active, project, env } = await fixture()
    const missing = path.join(path.dirname(active), 'pnpm-native')
    const child = spawnPnpm(['--version'], { cwd: project, env: { ...env, npm_execpath: missing }, stdio: 'pipe' })
    await expect(result(child)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it.each([true, false])('显式 cmd 入口存在=%s 时均在创建子进程前拒绝 shell 重解释', async (exists) => {
    const { active, project, env } = await fixture()
    const wrapper = path.join(path.dirname(active), 'pnpm.cmd')
    if (exists) {
      await writeFile(wrapper, '@echo wrapper must not run\r\n')
    }
    await expect(async () => result(spawnPnpm(['run', '带 空格', '"quoted" & %PATH%'], {
      cwd: project,
      env: { ...env, npm_execpath: wrapper },
      stdio: 'pipe',
    }))).rejects.toMatchObject({ code: 'ERR_UNSUPPORTED_PNPM_ENTRY' })
  })

  it.each(['npm-cli.js', 'yarn.js'])('不会将 %s 活动入口误当作 pnpm', async (name) => {
    const { active, project, env } = await fixture()
    const other = path.join(path.dirname(active), name)
    await writeFile(other, 'process.stdout.write("wrong package manager")')
    const actual = await result(spawnPnpm(['--version'], { cwd: project, env: { ...env, npm_execpath: other }, stdio: 'pipe' }))
    expect(actual.version).toBe('99.2.0')
  })
})
