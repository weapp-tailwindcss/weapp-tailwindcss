import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createInstallEnvironment, readAvailableInstallMemory } from '../../../../scripts/ci/install-memory.mjs'
import {
  DEFAULT_INSTALL_ATTEMPTS,
  DEFAULT_INSTALL_TIMEOUT_MS,
  DEFAULT_RETRY_DELAY_MS,
  installWorkspace,
  readInstallConfig,
} from '../../../../scripts/ci/install-workspace.mjs'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('CI workspace install guard', () => {
  it('uses bounded retries and accepts positive overrides', () => {
    expect(readInstallConfig({})).toEqual({
      attempts: DEFAULT_INSTALL_ATTEMPTS,
      timeoutMs: DEFAULT_INSTALL_TIMEOUT_MS,
      retryDelayMs: DEFAULT_RETRY_DELAY_MS,
    })
    expect(readInstallConfig({
      PNPM_INSTALL_ATTEMPTS: '3',
      PNPM_INSTALL_TIMEOUT_MS: '120000',
      PNPM_INSTALL_RETRY_DELAY_MS: '2500',
    })).toEqual({ attempts: 3, timeoutMs: 120000, retryDelayMs: 2500 })
  })

  it('ignores invalid or non-positive overrides', () => {
    expect(readInstallConfig({
      PNPM_INSTALL_ATTEMPTS: '0',
      PNPM_INSTALL_TIMEOUT_MS: '-1',
      PNPM_INSTALL_RETRY_DELAY_MS: 'not-a-number',
    })).toEqual({
      attempts: DEFAULT_INSTALL_ATTEMPTS,
      timeoutMs: DEFAULT_INSTALL_TIMEOUT_MS,
      retryDelayMs: DEFAULT_RETRY_DELAY_MS,
    })
  })

  it('安装子进程预算最多 4 GiB，且为其余进程至少保留一半可用内存', () => {
    const environment = { CUSTOM_FLAG: 'keep', NODE_OPTIONS: '--no-warnings' }
    expect(createInstallEnvironment(environment, 16 * 1024 ** 3)).toEqual({
      ...environment,
      NODE_OPTIONS: '--no-warnings --max-old-space-size=4096',
    })
    expect(createInstallEnvironment(environment, 3 * 1024 ** 3).NODE_OPTIONS)
      .toBe('--no-warnings --max-old-space-size=1536')
    expect(createInstallEnvironment({}, 512 * 1024 ** 2).NODE_OPTIONS)
      .toBe('--max-old-space-size=256')
    expect(environment.NODE_OPTIONS).toBe('--no-warnings')
  })

  it('容器限制参与预算，available API 缺失才回退 free，零或非法值必须拒绝', () => {
    const resources = { availableBytes: 16 * 1024 ** 3, freeBytes: 12 * 1024 ** 3, totalBytes: 32 * 1024 ** 3, constrainedBytes: 2 * 1024 ** 3 }
    expect(readAvailableInstallMemory(resources)).toBe(2 * 1024 ** 3)
    expect(readAvailableInstallMemory({ ...resources, availableBytes: undefined, constrainedBytes: 0 }))
      .toBe(resources.freeBytes)
    for (const availableBytes of [0, Number.NaN, Infinity, -1]) {
      expect(() => readAvailableInstallMemory({ ...resources, availableBytes })).toThrow('安全')
      expect(() => createInstallEnvironment({}, availableBytes)).toThrow('安全')
    }
  })

  it.each(['--max-old-space-size=768', '--max_old_space_size=1024', '--max-old-space-size 2048'])('保留明确的调用方 heap 配置：%s', (option) => {
    const environment = { NODE_OPTIONS: `--no-warnings ${option}`, CUSTOM_FLAG: 'keep' }
    expect(createInstallEnvironment(environment, 16 * 1024 ** 3)).toEqual(environment)
  })

  it('显式 heap 不依赖自动内存读数，无法读取预算时仍保留调用方参数', () => {
    const available = vi.spyOn(process, 'availableMemory').mockReturnValue(Number.NaN)
    const environment = { NODE_OPTIONS: '--max-old-space-size=768' }
    expect(createInstallEnvironment(environment)).toEqual(environment)
    expect(available).not.toHaveBeenCalled()
  })

  it('真实 pnpm 入口仅收到安装预算，父进程环境及冻结锁文件参数保持完整', async () => {
    const logger = vi.spyOn(console, 'log').mockImplementation(() => {})
    const directory = await mkdtemp(path.join(tmpdir(), 'pnpm-install-probe-'))
    const report = path.join(directory, 'report.json')
    const cli = path.join(directory, 'pnpm.mjs')
    try {
      await writeFile(cli, `import { writeFileSync } from 'node:fs';
import { getHeapStatistics } from 'node:v8';
writeFileSync(process.env.PNPM_INSTALL_PROBE, JSON.stringify({ args: process.argv.slice(2), options: process.env.NODE_OPTIONS, heapMb: getHeapStatistics().heap_size_limit / 1024 ** 2 }));
`)
      vi.stubEnv('npm_execpath', cli)
      vi.stubEnv('NODE_OPTIONS', '--no-warnings')
      vi.stubEnv('PNPM_INSTALL_PROBE', report)
      vi.stubEnv('PNPM_INSTALL_SECRET_PROBE', 'private-probe')
      const result = await installWorkspace({ attempts: 1, timeoutMs: 10000, retryDelayMs: 1 })
      expect(result.code).toBe(0)
      const child = JSON.parse(await readFile(report, 'utf8'))
      expect(child.args).toEqual(['install', '--frozen-lockfile'])
      expect(child.options).toMatch(/^--no-warnings --max-old-space-size=\d+$/)
      const configuredMb = Number(child.options.match(/--max-old-space-size=(\d+)/)[1])
      expect(configuredMb).toBeLessThanOrEqual(4096)
      const budgetLog = logger.mock.calls.map(([message]) => String(message)).find(message => message.startsWith('pnpm install 内存预算：'))
      expect(budgetLog).toBeDefined()
      expect(budgetLog).not.toContain('private-probe')
      const budget = JSON.parse(budgetLog!.slice('pnpm install 内存预算：'.length))
      expect(budget.heapMb).toBe(configuredMb)
      expect(budget.safeAvailableBytes).toBeLessThanOrEqual(budget.totalBytes)
      // V8 总 heap 还包含 young generation；这里同时证明参数已进入真实 Node 子进程。
      expect(child.heapMb).toBeGreaterThanOrEqual(configuredMb)
      expect(child.heapMb).toBeLessThanOrEqual(configuredMb + 512)
      expect(process.env.NODE_OPTIONS).toBe('--no-warnings')
    }
    finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})
