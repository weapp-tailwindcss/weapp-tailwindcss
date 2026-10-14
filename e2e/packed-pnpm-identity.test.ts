import { chmod, copyFile, link, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { install, pack } from '../packages/css-compat/scripts/package-utils.mjs'
import { execaPnpm } from '../scripts/pnpm-exec.mjs'

const roots: string[] = []

afterEach(async () => {
  vi.unstubAllEnvs()
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

async function fixture() {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'packed pnpm identity ')))
  roots.push(root)
  const bin = path.join(root, 'global bin')
  const active = path.join(root, 'active entry', 'pnpm.cjs')
  const record = path.join(root, 'calls.jsonl')
  const source = path.join(root, 'source package')
  const consumer = path.join(root, 'isolated consumer')
  await Promise.all([bin, path.dirname(active), source, consumer].map(directory => mkdir(directory)))
  const script = (version: string) => `const fs = require('node:fs'); const path = require('node:path');
const args = process.argv.slice(2);
const event = { version: '${version}', args, cwd: process.cwd(), ci: process.env.CI };
fs.appendFileSync(process.env.PACKED_PNPM_RECORD, JSON.stringify(event) + '\\n');
if (args[0] === 'pack') {
  const destination = args[args.indexOf('--pack-destination') + 1];
  fs.mkdirSync(destination, { recursive: true });
  fs.writeFileSync(path.join(destination, 'fixture.tgz'), 'fixture');
}
process.stdout.write(JSON.stringify(event));
`
  await writeFile(active, script('99.1.0'))
  const dispatch = path.join(bin, 'dispatch.cjs')
  await writeFile(dispatch, script('99.2.0'))
  // 模拟无 packageManager 的临时消费者落到全局入口，不安装依赖或联网。
  if (process.platform === 'win32') {
    await writeFile(path.join(bin, 'pnpm.cmd'), `@"${process.execPath}" "${dispatch}" %*\r\n`)
  }
  else {
    const shim = path.join(bin, 'pnpm')
    await writeFile(shim, '#!/usr/bin/env node\nrequire("./dispatch.cjs")\n')
    await chmod(shim, 0o755)
  }
  vi.stubEnv('npm_execpath', active)
  vi.stubEnv('PACKED_PNPM_RECORD', record)
  vi.stubEnv('PATH', [bin, path.dirname(process.execPath), process.env['PATH']].filter(Boolean).join(path.delimiter))
  return {
    root,
    active,
    source,
    consumer,
    childEnvironment: { PATH: process.env['PATH'], PACKED_PNPM_RECORD: record },
    async calls() {
      return (await readFile(record, 'utf8')).trim().split('\n').map(line => JSON.parse(line))
    },
  }
}

describe('打包验收保留入口 pnpm 身份', () => {
  it('无 packageManager 的隔离安装沿用活动 CLI，并保留 CI 配置', async () => {
    const { consumer, calls } = await fixture()
    await install(consumer, {})
    expect(JSON.parse(await readFile(path.join(consumer, 'package.json'), 'utf8')).packageManager).toBeUndefined()
    expect(await calls()).toEqual([{
      version: '99.1.0',
      args: ['install', '--ignore-scripts', '--no-frozen-lockfile'],
      cwd: consumer,
      ci: '1',
    }])
  })

  it('切换打包 cwd 后仍使用同一 CLI，保留含空格的产物路径', async () => {
    const { root, source, calls } = await fixture()
    const destination = path.join(root, 'packed', path.basename(source))
    expect(await pack(root, source)).toBe(path.join(destination, 'fixture.tgz'))
    expect(await calls()).toEqual([{
      version: '99.1.0',
      args: ['pack', '--pack-destination', destination],
      cwd: source,
      ci: process.env['CI'],
    }])
  })

  it('隔离 list/exec 原样传递空格、引号和 shell 字面参数', async () => {
    const { consumer } = await fixture()
    const args = ['exec', 'tool', '空 格', '"$literal" & %PATH%']
    const result = await execaPnpm(args, { cwd: consumer, timeout: 5000 })
    expect(JSON.parse(result.stdout)).toMatchObject({ version: '99.1.0', args, cwd: consumer })
  })

  it('显式清除活动入口的子环境使用 PATH，不误继承父调用者', async () => {
    const { consumer } = await fixture()
    const result = await execaPnpm(['--version'], { cwd: consumer, env: { npm_execpath: undefined }, timeout: 5000 })
    expect(JSON.parse(result.stdout).version).toBe('99.2.0')
  })

  it('关闭环境继承时不从父环境重新领取活动入口', async () => {
    const { consumer, childEnvironment } = await fixture()
    const result = await execaPnpm(['--version'], {
      cwd: consumer,
      env: childEnvironment,
      extendEnv: false,
      timeout: 5000,
    })
    expect(JSON.parse(result.stdout).version).toBe('99.2.0')
  })

  it('原生活动入口直接执行，不把二进制当作 Node 脚本', async () => {
    const { active, consumer } = await fixture()
    const native = path.join(path.dirname(active), process.platform === 'win32' ? 'pnpm-native.exe' : 'pnpm-native')
    await link(process.execPath, native).catch(() => copyFile(process.execPath, native))
    const result = await execaPnpm(['-e', 'process.stdout.write(JSON.stringify({ native: true, cwd: process.cwd() }))'], {
      cwd: consumer,
      env: { npm_execpath: native },
      timeout: 5000,
    })
    expect(JSON.parse(result.stdout)).toEqual({ native: true, cwd: consumer })
  })

  it('缺失的显式入口阻断，不静默切到另一版本', async () => {
    const { root, consumer } = await fixture()
    await expect(execaPnpm(['--version'], {
      cwd: consumer,
      env: { npm_execpath: path.join(root, 'missing entry', 'pnpm-native') },
      timeout: 5000,
    })).rejects.toMatchObject({ code: 'ENOENT' })
  })
})
