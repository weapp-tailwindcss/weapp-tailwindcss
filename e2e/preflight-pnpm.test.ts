import type { ProbeContext } from '../scripts/e2e-preflight/types'
import { readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { assertIdentity, collectIdentity, command } from '../scripts/e2e-preflight/io'
import { base } from '../scripts/e2e-preflight/probes/desktop'
import { computerEvidence, fixtureSession } from './preflight-fixture'

vi.mock('../scripts/e2e-preflight/io', async original => ({ ...await original<object>(), command: vi.fn() }))

const run = vi.mocked(command)
const context: ProbeContext = { root: process.cwd(), dir: os.tmpdir(), runId: 'synthetic-pnpm', url: 'http://127.0.0.1:1', phase: 'live' }
const dirs: string[] = []
let version: string

beforeEach(async () => {
  version = JSON.parse(await readFile(path.join(context.root, 'package.json'), 'utf8')).packageManager.slice('pnpm@'.length)
  run.mockResolvedValue(version)
  vi.stubGlobal('fetch', async () => new Response(context.runId))
})
afterEach(async () => {
  vi.resetAllMocks()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  await Promise.all(dirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })))
})

describe('预检沿用本轮实际 pnpm 入口', () => {
  it('活动 JavaScript 入口由当前 Node 执行，保留含中文、空格和 & 的路径', async () => {
    const entry = path.join(os.tmpdir(), '预检 & pnpm', 'pnpm.cjs')
    vi.stubEnv('npm_execpath', entry)
    const output = await base(context)
    expect(output.binding?.['pnpm']).toBe(version)
    expect(run).toHaveBeenCalledWith(process.execPath, [entry, '--version'], 15_000, false)
  })

  it('活动版本错误时阻断，不能用 PATH 中正确版本替代', async () => {
    const entry = path.join(os.tmpdir(), 'active-pnpm', 'pnpm.cjs')
    vi.stubEnv('npm_execpath', entry)
    run.mockImplementation(async (_file, args) => args.includes(entry) ? '0.0.0' : version)
    await expect(base(context)).rejects.toThrow('实际')
    expect(run).toHaveBeenCalledOnce()
  })

  it('原生 pnpm 入口直接执行，不改用 Node 或 PATH', async () => {
    const entry = path.join(os.tmpdir(), 'active-pnpm', process.platform === 'win32' ? 'pnpm-native.exe' : 'pnpm-native')
    vi.stubEnv('npm_execpath', entry)
    await base(context)
    expect(run).toHaveBeenCalledWith(entry, ['--version'], 15_000, false)
  })

  it.each([undefined, 'npm-cli.js'])('没有有效活动 pnpm 入口 %s 时保留 PATH fallback', async (entry) => {
    vi.stubEnv('npm_execpath', entry)
    await base(context)
    expect(run).toHaveBeenCalledWith(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', ['--version'], 15_000, process.platform === 'win32')
  })

  it('活动入口不可用时不尝试 PATH fallback', async () => {
    const entry = path.join(os.tmpdir(), 'missing-active-pnpm', 'pnpm.cjs')
    vi.stubEnv('npm_execpath', entry)
    run.mockImplementation(async (_file, args) => {
      if (args.includes(entry)) {
        throw new Error('活动 pnpm 不可用')
      }
      return version
    })
    await expect(base(context)).rejects.toThrow('活动 pnpm 不可用')
    expect(run).toHaveBeenCalledOnce()
  })

  it('PATH 不变而活动入口改变时旧门禁失效，测试回调不启动', async () => {
    vi.stubEnv('npm_execpath', path.join(os.tmpdir(), 'pnpm-a', 'pnpm.cjs'))
    const initial = await collectIdentity(context.root)
    const { dir, report, session } = await fixtureSession(initial)
    dirs.push(dir)
    await computerEvidence(session)
    await session.verify(initial)
    vi.stubEnv('npm_execpath', path.join(os.tmpdir(), 'pnpm-b', 'pnpm.cjs'))
    const current = await collectIdentity(context.root)
    expect(current.config['PATH']).toBe(initial.config['PATH'])
    expect(current.config['pnpmInvocation']).not.toBe(initial.config['pnpmInvocation'])
    expect(() => assertIdentity(initial, current)).toThrow('变化字段：config')
    const execute = vi.fn()
    await expect(session.claim(current, 'synthetic-consumer').then(execute)).rejects.toThrow('变化字段：config')
    expect(execute).not.toHaveBeenCalled()
    expect(report.status).toBe('blocked')
  })
})
