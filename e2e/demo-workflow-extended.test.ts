import { EventEmitter } from 'node:events'
import process from 'node:process'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runDemoE2eWorkflow } from '../scripts/demo-e2e-workflow'

const mocks = vi.hoisted(() => ({ enter: vi.fn(), spawn: vi.fn(), execFile: vi.fn(), writeReport: vi.fn() }))
vi.mock('node:child_process', () => ({ spawn: mocks.spawn, execFile: mocks.execFile }))
vi.mock('../scripts/e2e-preflight/gate', () => ({ enterFullTestGate: mocks.enter }))
vi.mock('../scripts/demo-e2e-memory', async importOriginal => ({
  ...await importOriginal<typeof import('../scripts/demo-e2e-memory')>(),
  sampleProcessTreeAsync: async () => undefined,
  writeDemoE2eMemoryReport: mocks.writeReport,
}))

const baseline = '148cebd6ce3584f5b2c930dd63639a0c3a5d47ee'
const args = ['--local', '--quality', '--extended', '--baseline-ref', baseline, '--preflight-report', 'current.json']

describe('扩展回归的完整覆盖与门禁', () => {
  const gate = {
    env: { RN_ANDROID_DEVICE_ID: 'android-verified', LYNX_IOS_DEVICE_ID: 'ios-verified' },
    check: vi.fn(),
    close: vi.fn(),
  }

  beforeEach(() => {
    vi.resetAllMocks()
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    mocks.enter.mockResolvedValue(gate)
    mocks.execFile.mockImplementation((_file, _args, _options, callback) => callback(null, `${baseline}\n`))
    mocks.writeReport.mockResolvedValue({ markdownFile: 'report.md' })
    mocks.spawn.mockImplementation(() => {
      const child = new EventEmitter()
      queueMicrotask(() => child.emit('close', 0))
      return child
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it.each([
    ['--extended'],
    ['--local', '--extended'],
    ['--quality', '--extended'],
    ['--local', '--quality', '--extended'],
    ['--local', '--quality', '--extended', '--baseline-ref', 'origin/main'],
  ])('参数 %j 不能启动未绑定基线或门禁的扩展测试', async (...argv) => {
    await expect(runDemoE2eWorkflow(argv)).rejects.toThrow('--extended')
    expect(mocks.enter).not.toHaveBeenCalled()
    expect(mocks.spawn).not.toHaveBeenCalled()
  })

  it('预检失败时不启动扩展测试或基线构建', async () => {
    mocks.enter.mockRejectedValueOnce(new Error('设备未就绪'))
    await expect(runDemoE2eWorkflow(args)).rejects.toThrow('设备未就绪')
    expect(mocks.spawn).not.toHaveBeenCalled()
    expect(mocks.execFile).not.toHaveBeenCalled()
  })

  it('不存在或非提交的性能基线在首个测试前拒绝，并释放门禁', async () => {
    mocks.execFile.mockImplementation((_file, _args, _options, callback) => callback(new Error('not a valid object')))
    await expect(runDemoE2eWorkflow(args)).rejects.toThrow('性能基线提交不可用')
    expect(mocks.spawn).not.toHaveBeenCalled()
    expect(gate.close).toHaveBeenCalledOnce()
  })

  it('拒绝将 tag 对象 SHA 当作提交基线', async () => {
    mocks.execFile.mockImplementation((_file, _args, _options, callback) => callback(null, `${'a'.repeat(40)}\n`))
    await expect(runDemoE2eWorkflow(args)).rejects.toThrow('直接指定提交 SHA')
    expect(mocks.spawn).not.toHaveBeenCalled()
    expect(gate.close).toHaveBeenCalledOnce()
  })

  it('独立质量与模板套件进入同一门禁，原生逐平台执行并固定性能基线', async () => {
    await runDemoE2eWorkflow(args)
    const commands = mocks.spawn.mock.calls.map(([command, argv]) => [command, ...argv].join(' '))
    for (const name of ['tsd', 'stylelint', 'release:verify', 'agents:test --update=none', 'test:demo:matrix', 'test:perf:demo', 'skills:validate', 'docs:packages:check', 'e2e:preprocessor', 'e2e:demo-user-workflow', 'e2e:templates', 'e2e:templates:hmr', 'e2e:templates:ide', 'e2e:dev:smoke']) {
      expect(commands, name).toContain(`pnpm ${name}`)
    }
    expect(commands).toContain('pnpm --filter @weapp-tailwindcss/engine --filter @weapp-tailwindcss/source-scan --filter @weapp-tailwindcss/escape --filter @weapp-tailwindcss/website run typecheck')
    expect(commands).toContain('pnpm exec vitest run -c ./e2e/vitest.e2e.config.ts e2e/framework-ci-support.test.ts --update=none')
    const framework = mocks.spawn.mock.calls.find(([, argv]) => argv.includes('e2e/framework-ci-support.test.ts'))
    expect(framework?.[2].env.E2E_FRAMEWORK_SUPPORT).toBe('1')
    expect(commands.indexOf('pnpm release:verify')).toBeLessThan(commands.indexOf('pnpm e2e:static'))
    expect(commands.indexOf('pnpm e2e:templates')).toBeLessThan(commands.indexOf('pnpm e2e:mp:ide'))
    expect(commands.slice(-7)).toEqual([
      'pnpm e2e:react-native:web',
      'pnpm e2e:react-native:android',
      'pnpm e2e:react-native:ios',
      'pnpm e2e:lynx:android',
      'pnpm e2e:lynx:ios',
      'pnpm perf:synthetic:guard',
      `pnpm perf:guard --baseline-ref ${baseline}`,
    ])
    expect(commands.filter(command => command === 'pnpm e2e:static')).toHaveLength(1)
    expect(commands).not.toContain('pnpm e2e:canonical-templates')
    expect(mocks.enter).toHaveBeenCalledExactlyOnceWith('current.json', process.cwd(), true)
    expect(gate.check).toHaveBeenCalledTimes(commands.length)
    expect(gate.check).toHaveBeenCalledWith('React Native Android runtime')
    expect(gate.check).toHaveBeenCalledWith('Lynx iOS runtime')
    expect(gate.close).toHaveBeenCalledOnce()
  })

  it('清理继承的过滤、跳过和基线更新，保留工具配置并优先采用门禁设备', async () => {
    const filters = ['E2E_TEMPLATE_CASE', 'E2E_WATCH_CASE', 'E2E_HBUILDERX_CASE', 'DEMO_VISUAL_FILTER', 'DEMO_VISUAL_STYLE_ISOLATION_VARIANT', 'E2E_IDE_REQUIRE_LIVE_PAGE_VISIBILITY', 'RN_ANDROID_BINARY', 'LYNX_NATIVE_WORK_DIR']
    const switches = ['RN_UPDATE_BASELINE', 'E2E_TEMPLATE_SKIP_BUILD', 'E2E_TEMPLATE_HMR_SKIP', 'LYNX_IOS_SKIP_POD_INSTALL']
    for (const key of [...filters, ...switches]) {
      vi.stubEnv(key, '1')
    }
    vi.stubEnv('DEMO_VISUAL_STYLE_ISOLATION_VARIANT', 'style-isolation-v2')
    vi.stubEnv('E2E_IDE_REQUIRE_LIVE_PAGE_VISIBILITY', '0')
    vi.stubEnv('CI', '0')
    vi.stubEnv('LYNX_IOS_DEVICE_ID', 'unverified-device')
    vi.stubEnv('HBUILDERX_CLI_PATH', '/selected/cli')
    await runDemoE2eWorkflow(args)
    for (const [, , options] of mocks.spawn.mock.calls) {
      for (const key of filters) {
        expect(options.env[key], key).toBeUndefined()
      }
      for (const key of switches) {
        expect(options.env[key], key).toBe('0')
      }
      expect(options.env).toMatchObject({ CI: '1', HBUILDERX_CLI_PATH: '/selected/cli', LYNX_IOS_DEVICE_ID: 'ios-verified' })
    }
    expect(process.env.E2E_TEMPLATE_CASE).toBe('1')
  })

  it('扩展质量失败时记录失败并停止后续静态、设备和性能测试', async () => {
    mocks.spawn.mockImplementation((_command: string, argv: string[]) => {
      const child = new EventEmitter()
      queueMicrotask(() => child.emit('close', argv[0] === 'release:verify' ? 2 : 0))
      return child
    })
    await expect(runDemoE2eWorkflow(args)).rejects.toThrow('failed with exit=2')
    const commands = mocks.spawn.mock.calls.map(([, argv]) => argv[0])
    expect(commands.at(-1)).toBe('release:verify')
    expect(commands).not.toContain('e2e:static')
    expect(mocks.writeReport.mock.calls.at(-1)?.[0].report.exitCode).toBe(1)
    expect(gate.close).toHaveBeenCalledOnce()
  })

  it.each(['e2e:react-native:web', 'e2e:react-native:ios', 'e2e:lynx:ios'])('%s 失败后不继续其他运行时或性能阶段', async (failed) => {
    mocks.spawn.mockImplementation((_command: string, argv: string[]) => {
      const child = new EventEmitter()
      queueMicrotask(() => child.emit('close', argv[0] === failed ? 1 : 0))
      return child
    })
    await expect(runDemoE2eWorkflow(args)).rejects.toThrow('failed with exit=1')
    expect(mocks.spawn.mock.calls.at(-1)?.[1]).toEqual([failed])
    expect(gate.close).toHaveBeenCalledOnce()
  })

  it('Lynx 阶段设备复查失败时不启动原生构建，仍释放门禁', async () => {
    gate.check.mockImplementationOnce(() => undefined)
    gate.check.mockImplementation((stage: string) => {
      if (stage === 'Lynx Android runtime') {
        throw new Error('绑定设备已掉线')
      }
    })
    await expect(runDemoE2eWorkflow(args)).rejects.toThrow('绑定设备已掉线')
    expect(mocks.spawn.mock.calls.at(-1)?.[1]).toEqual(['e2e:react-native:ios'])
    expect(gate.close).toHaveBeenCalledOnce()
  })
})
