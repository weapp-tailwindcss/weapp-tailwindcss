import { EventEmitter } from 'node:events'
import process from 'node:process'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runDemoE2eWorkflow } from '../scripts/demo-e2e-workflow'

const mocks = vi.hoisted(() => ({
  enter: vi.fn(),
  spawn: vi.fn(),
  writeReport: vi.fn(),
}))

vi.mock('node:child_process', () => ({ spawn: mocks.spawn }))
vi.mock('../scripts/e2e-preflight/gate', () => ({ enterFullTestGate: mocks.enter }))
vi.mock('../scripts/demo-e2e-memory', async importOriginal => ({
  ...await importOriginal<typeof import('../scripts/demo-e2e-memory')>(),
  sampleProcessTree: () => undefined,
  writeDemoE2eMemoryReport: mocks.writeReport,
}))

describe('本地质量验证的全面测试门禁', () => {
  const events: string[] = []
  const gate = {
    env: { E2E_PREFLIGHT_WECHAT_CLI: 'verified-wechat-cli' },
    check: vi.fn(async (stage: string) => { events.push(`check:${stage}`) }),
    close: vi.fn(async () => { events.push('close') }),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    events.length = 0
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    mocks.enter.mockImplementation(async () => {
      events.push('claim')
      return gate
    })
    mocks.writeReport.mockResolvedValue({ markdownFile: 'quality-report.md' })
    mocks.spawn.mockImplementation((_command: string, args: string[]) => {
      events.push(`spawn:${args.join(' ')}`)
      const child = new EventEmitter()
      queueMicrotask(() => child.emit('close', 0))
      return child
    })
  })

  afterEach(() => vi.restoreAllMocks())

  it('拒绝不含本地门禁的 quality 请求，且不启动任何命令', async () => {
    await expect(runDemoE2eWorkflow(['--quality'])).rejects.toThrow('--quality 必须配合 --local')
    expect(mocks.enter).not.toHaveBeenCalled()
    expect(mocks.spawn).not.toHaveBeenCalled()
  })

  it('门禁失败时不启动质量或设备步骤', async () => {
    mocks.enter.mockRejectedValueOnce(new Error('本轮预检未通过'))
    await expect(runDemoE2eWorkflow(['--local', '--quality'])).rejects.toThrow('本轮预检未通过')
    expect(mocks.enter).toHaveBeenCalledWith(undefined, process.cwd(), false)
    expect(mocks.spawn).not.toHaveBeenCalled()
    expect(gate.close).not.toHaveBeenCalled()
  })

  it('先验证质量，再执行完整平台步骤，并共用一次门禁和环境绑定', async () => {
    await runDemoE2eWorkflow(['--local', '--quality', '--preflight-report', 'current-report.json'])
    const commands = mocks.spawn.mock.calls.map(([command, args]) => [command, ...args].join(' '))
    expect(commands.slice(0, 9)).toEqual([
      'pnpm build',
      'pnpm test --update=none',
      'pnpm lint',
      'pnpm typecheck',
      'pnpm architecture:check',
      'pnpm --filter @weapp-tailwindcss/website build',
      'pnpm agents:check',
      'pnpm release status',
      'git diff --check',
    ])
    expect(commands.slice(9)).toEqual([
      'pnpm exec vitest run -c ./e2e/vitest.e2e.config.ts e2e/e2e-matrix.test.ts',
      'pnpm e2e:static',
      'pnpm e2e:multiplatform-build',
      'pnpm e2e:mp:ide',
      'pnpm e2e:hot-update:demo',
      'pnpm e2e:h5',
      'pnpm e2e:uni:h5',
      'pnpm e2e:hbuilderx:mp',
      'pnpm e2e:hbuilderx:h5',
      'pnpm e2e:android',
      'pnpm e2e:ios',
      'pnpm e2e:harmony',
      'pnpm exec tsx scripts/demo-visual-e2e-report.ts --h5-only --fail-on-incomplete',
      'pnpm exec tsx scripts/demo-visual-e2e-report.ts --harmony-only --fail-on-incomplete',
    ])
    const multiPlatformStep = mocks.spawn.mock.calls.find(([, args]) => args[0] === 'e2e:multiplatform-build')
    expect(multiPlatformStep?.[2].env).toMatchObject({
      E2E_MULTIPLATFORM_BUILD_STATUS: 'ci',
      E2E_MULTIPLATFORM_BUILD_CASE: '',
      E2E_MULTIPLATFORM_BUILD_SKIP_BUILD: '0',
    })
    const visualStart = mocks.spawn.mock.calls.find(([, args]) => args[0] === 'e2e:mp:ide')
    expect(visualStart?.[2].env.DEMO_VISUAL_REPORT_RESET).toBe('1')
    for (const [, args, options] of mocks.spawn.mock.calls) {
      if (args.includes('--h5-only') || args.includes('--harmony-only')) {
        expect(options.env).toMatchObject({
          DEMO_VISUAL_REPORT_RESET: '0',
          DEMO_VISUAL_MAX_CROSS_PLATFORM_DIFF_RATIO: '0.05',
        })
      }
    }
    expect(commands.filter(command => command === 'pnpm e2e:static')).toHaveLength(1)
    expect(commands).not.toContain('pnpm e2e:mp')
    expect(mocks.enter).toHaveBeenCalledExactlyOnceWith('current-report.json', process.cwd(), false)
    expect(gate.close).toHaveBeenCalledTimes(1)
    expect(events[0]).toBe('claim')
    expect(events.at(-1)).toBe('close')
    for (let index = 1; index < events.length - 1; index += 2) {
      expect(events[index]).toMatch(/^check:/)
      expect(events[index + 1]).toMatch(/^spawn:/)
    }
    for (const [, , options] of mocks.spawn.mock.calls) {
      expect(options.env.E2E_PREFLIGHT_WECHAT_CLI).toBe(gate.env.E2E_PREFLIGHT_WECHAT_CLI)
    }
  })

  it.each(['e2e:static', 'e2e:multiplatform-build'])('%s 失败后停止，不进入 IDE 或设备阶段', async (failedCommand) => {
    mocks.spawn.mockImplementation((_command: string, args: string[]) => {
      const child = new EventEmitter()
      queueMicrotask(() => child.emit('close', args[0] === failedCommand ? 1 : 0))
      return child
    })
    await expect(runDemoE2eWorkflow(['--local', '--quality'])).rejects.toThrow('failed with exit=1')
    const commands = mocks.spawn.mock.calls.map(([, args]) => args[0])
    expect(commands.at(-1)).toBe(failedCommand)
    expect(commands).not.toContain('e2e:mp:ide')
    expect(commands).not.toContain('e2e:hbuilderx:mp')
    expect(gate.close).toHaveBeenCalledOnce()
  })

  it('H5 截图补齐失败后不采集 Harmony，不把缺证计为通过', async () => {
    mocks.spawn.mockImplementation((_command: string, args: string[]) => {
      const child = new EventEmitter()
      queueMicrotask(() => child.emit('close', args.includes('--h5-only') ? 1 : 0))
      return child
    })
    await expect(runDemoE2eWorkflow(['--local', '--quality'])).rejects.toThrow('failed with exit=1')
    const commands = mocks.spawn.mock.calls.map(([, args]) => args.join(' '))
    expect(commands.at(-1)).toContain('--h5-only --fail-on-incomplete')
    expect(commands.some(command => command.includes('--harmony-only'))).toBe(false)
    expect(mocks.writeReport.mock.calls.at(-1)?.[0].report.exitCode).toBe(1)
    expect(gate.close).toHaveBeenCalledOnce()
  })

  it('质量步骤失败时记录失败并释放门禁，不继续设备验收', async () => {
    mocks.spawn.mockImplementationOnce(() => {
      const child = new EventEmitter()
      queueMicrotask(() => child.emit('close', 2))
      return child
    })
    await expect(runDemoE2eWorkflow(['--local', '--quality'])).rejects.toThrow('quality root build failed with exit=2')
    expect(mocks.spawn).toHaveBeenCalledTimes(1)
    expect(mocks.writeReport.mock.calls.at(-1)?.[0].report.exitCode).toBe(1)
    expect(mocks.writeReport.mock.calls.at(-1)?.[0].report.steps[0].exitCode).toBe(2)
    expect(gate.close).toHaveBeenCalledTimes(1)
  })

  it('阶段复查失败时不启动该阶段，并释放门禁', async () => {
    gate.check.mockRejectedValueOnce(new Error('环境已失效'))
    await expect(runDemoE2eWorkflow(['--local', '--quality'])).rejects.toThrow('环境已失效')
    expect(mocks.spawn).not.toHaveBeenCalled()
    expect(gate.close).toHaveBeenCalledTimes(1)
  })

  it('默认 hosted 工作流不新增质量步骤或本地门禁', async () => {
    await runDemoE2eWorkflow([])
    expect(mocks.enter).not.toHaveBeenCalled()
    expect(mocks.spawn).toHaveBeenCalledTimes(7)
    expect(mocks.spawn.mock.calls[0]?.[1]).toEqual(['exec', 'vitest', 'run', '-c', './e2e/vitest.e2e.config.ts', 'e2e/e2e-matrix.test.ts'])
  })

  it('阶段复查和清理同时失败时保留两处原始错误', async () => {
    const primary = new Error('quality lint 已阻断；报告：blocked/report.md')
    const cleanup = new TypeError('finish fetch failed')
    gate.check.mockRejectedValueOnce(primary)
    gate.close.mockRejectedValueOnce(cleanup)
    const error = await runDemoE2eWorkflow(['--local', '--quality']).catch(error => error)
    expect(error).toBeInstanceOf(AggregateError)
    expect(error.errors).toEqual([primary, cleanup])
    expect(error.cause).toBe(primary)
    expect(mocks.spawn).not.toHaveBeenCalled()
    expect(gate.close).toHaveBeenCalledOnce()
  })

  it('子进程和清理同时失败时保留失败报告并停止后续阶段', async () => {
    mocks.spawn.mockImplementationOnce(() => {
      const child = new EventEmitter()
      queueMicrotask(() => child.emit('close', 2))
      return child
    })
    const cleanup = new Error('finish unavailable')
    gate.close.mockRejectedValueOnce(cleanup)
    const error = await runDemoE2eWorkflow(['--local', '--quality']).catch(error => error)
    expect(error).toBeInstanceOf(AggregateError)
    expect(error.errors[0].message).toContain('quality root build failed with exit=2')
    expect(error.errors[1]).toBe(cleanup)
    expect(mocks.spawn).toHaveBeenCalledOnce()
    expect(mocks.writeReport.mock.calls.at(-1)?.[0].report.exitCode).toBe(1)
    expect(gate.close).toHaveBeenCalledOnce()
  })

  it('仅清理失败时拒绝完成且不提前输出成功', async () => {
    const cleanup = new Error('finish unavailable')
    gate.close.mockRejectedValueOnce(cleanup)
    await expect(runDemoE2eWorkflow(['--local', '--quality'])).rejects.toBe(cleanup)
    expect(vi.mocked(process.stdout.write).mock.calls.flat().join('')).not.toContain('workflow passed')
    expect(gate.close).toHaveBeenCalledOnce()
  })

  it('失败报告写入异常也保留原始阶段错误', async () => {
    const primary = new Error('quality lint blocked')
    const reportError = new Error('report write failed')
    gate.check.mockRejectedValueOnce(primary)
    mocks.writeReport.mockRejectedValueOnce(reportError)
    const error = await runDemoE2eWorkflow(['--local', '--quality']).catch(error => error)
    expect(error.errors).toEqual([primary, reportError])
    expect(error.cause).toBe(primary)
    expect(gate.close).toHaveBeenCalledOnce()
    expect(mocks.spawn).not.toHaveBeenCalled()
  })

  it.each([new Error('阶段失败'), undefined, null, 0])('清理成功后原样保留主错误 %s', async (primary) => {
    gate.check.mockRejectedValueOnce(primary)
    await expect(runDemoE2eWorkflow(['--local', '--quality'])).rejects.toBe(primary)
    expect(gate.close).toHaveBeenCalledOnce()
  })

  it('成功消息仅在清理成功后输出', async () => {
    await runDemoE2eWorkflow(['--local', '--quality'])
    const stdout = vi.mocked(process.stdout.write)
    const success = stdout.mock.calls.findIndex(([message]) => String(message).includes('workflow passed'))
    expect(success).toBeGreaterThanOrEqual(0)
    expect(stdout.mock.invocationCallOrder[success]).toBeGreaterThan(gate.close.mock.invocationCallOrder[0]!)
  })
})
