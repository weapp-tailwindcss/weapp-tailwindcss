import type { MiniProgram } from '@weapp-vite/miniprogram-automator'
import type { ProbeContext } from '../scripts/e2e-preflight/types'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { chromium } from 'playwright'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { command } from '../scripts/e2e-preflight/io'
import { base, hbuilderx, wechat } from '../scripts/e2e-preflight/probes/desktop'
import { hbuilderxTools } from '../scripts/e2e-preflight/probes/hbuilderx-tools'
import { android, parseAdbDevices, requestedTarget, selectTarget } from '../scripts/e2e-preflight/probes/native'
import { waitForProbe } from '../scripts/e2e-preflight/probes/wait'
import { web } from '../scripts/e2e-preflight/probes/web'
import { connectWechat } from '../scripts/e2e-preflight/probes/wechat-connect'
import { wechatVersion, wechatVersionCandidates } from '../scripts/e2e-preflight/probes/wechat-version'
import { runOwnedWorker } from '../scripts/e2e-preflight/process'
import { requestedIosTarget } from '../scripts/e2e-preflight/targets'
import { Launcher } from '../scripts/wechat/automator'
import { assertWechatLogin, existingWechatService, ownedWechatPort, wechatRequest } from '../scripts/wechat/service'

vi.mock('../scripts/e2e-preflight/io', async original => ({ ...await original<object>(), command: vi.fn() }))
vi.mock('../scripts/wechat/service', () => ({ assertWechatLogin: vi.fn(), existingWechatService: vi.fn(), ownedWechatPort: vi.fn(), wechatRequest: vi.fn() }))
const run = vi.mocked(command)
const dirs: string[] = []
beforeEach(() => {
  vi.mocked(ownedWechatPort).mockReturnValue('12345')
  vi.mocked(existingWechatService).mockImplementation(async cli => ({ command: cli ?? 'fake-cli', version: '2.02.2608070', metadata: 'fake-metadata', httpPort: '12345' }))
  vi.mocked(assertWechatLogin).mockResolvedValue(undefined)
  vi.mocked(wechatRequest).mockImplementation(async (_port, operation) => operation.kind === 'auto' ? { autoPort: operation.port } : { success: true })
  // 模拟设备由用例显式指定，不能继承全面验收绑定的真实设备。
  for (const key of [
    'E2E_HBUILDERX_ANDROID_DEVICE_ID',
    'E2E_HBUILDERX_ANDROID_SCREENSHOT_DEVICE_ID',
    'DEMO_VISUAL_ANDROID_DEVICE_ID',
    'RN_ANDROID_DEVICE_ID',
    'LYNX_ANDROID_DEVICE_ID',
    'ANDROID_SERIAL',
  ]) {
    vi.stubEnv(key, undefined)
  }
})
afterEach(async () => {
  vi.resetAllMocks()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  await Promise.all(dirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })))
})

const context: ProbeContext = { root: process.cwd(), dir: process.cwd(), runId: 'test', url: 'http://127.0.0.1:1', phase: 'live' }

describe('真实探针的阻断条件', () => {
  it('命令已安装但 adb 列表为空时仍阻断', async () => {
    run.mockImplementation(async (_file, args) => args[0] === 'version' ? 'Android Debug Bridge version 1.0.41' : 'List of devices attached\n')
    await expect(android(context)).rejects.toThrow('目标设备')
  })

  it.each(['unauthorized', 'offline'])('指定 Android 设备 %s 时阻断', async (state) => {
    vi.stubEnv('E2E_HBUILDERX_ANDROID_DEVICE_ID', 'emulator-test')
    run.mockImplementation(async (_file, args) => args[0] === 'version' ? 'adb 1' : `List of devices attached\nemulator-test ${state}`)
    await expect(android(context)).rejects.toThrow(state)
  })

  it('设备显示在线但系统未启动时不通过', async () => {
    run.mockImplementation(async (_file, args) => {
      if (args[0] === 'version') {
        return 'adb 1'
      }
      if (args[0] === 'devices') {
        return 'emulator-test device'
      }
      return '0'
    })
    await expect(android(context)).rejects.toThrow('未完成启动')
  })

  it('多个目标不得默认选择第一个', () => {
    expect(() => selectTarget(['a', 'b'])).toThrow('唯一明确')
    expect(selectTarget(['a', 'b'], 'b')).toBe('b')
    expect(() => selectTarget(['a'], 'missing')).toThrow('指定设备不可用')
    expect(parseAdbDevices('List of devices attached\na device product:test\nb offline\nc unauthorized')).toEqual([
      { id: 'a', state: 'device' },
      { id: 'b', state: 'offline' },
      { id: 'c', state: 'unauthorized' },
    ])
  })

  it('IDE 未登录或登录输出不明均不得放行', async () => {
    vi.mocked(assertWechatLogin).mockRejectedValue(new Error('登录未确认'))
    const dir = await mkdtemp(path.join(os.tmpdir(), 'wt-preflight-wechat-'))
    dirs.push(dir)
    const cli = path.join(dir, 'cli')
    await writeFile(cli, '')
    await mkdir(path.join(dir, 'package.nw'))
    await writeFile(path.join(dir, 'package.nw', 'package.json'), JSON.stringify({ name: '微信开发者工具', version: '2.02.2608070' }))
    run.mockResolvedValue('{"login":false}')
    await expect(wechat({ ...context, binding: { command: cli } })).rejects.toThrow('登录未确认')
    expect(run).not.toHaveBeenCalled()
    expect((await wechatVersion(cli)).version).toBe('2.02.2608070')
    expect(run.mock.calls.every(([, args]) => !args.includes('--version'))).toBe(true)
  })

  it('基础依赖允许 import-only ESM exports', async () => {
    const manifest = JSON.parse(await readFile(path.join(context.root, 'package.json'), 'utf8'))
    run.mockResolvedValue(manifest.packageManager.slice('pnpm@'.length))
    vi.stubGlobal('fetch', async () => new Response(context.runId))
    await expect(base(context)).resolves.toHaveProperty('binding.pnpm')
  })

  it('微信预检使用仓库项目的授权 AppID', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'wt-preflight-wechat-'))
    dirs.push(dir)
    const cli = path.join(dir, 'cli')
    await writeFile(cli, '')
    await mkdir(path.join(dir, 'package.nw'))
    await writeFile(path.join(dir, 'package.nw', 'package.json'), JSON.stringify({ name: '微信开发者工具', version: '2.02.2608070' }))
    vi.mocked(wechatRequest).mockImplementation(async (_port, operation) => {
      if (operation.kind === 'auto') {
        const project = operation.project
        const config = JSON.parse(await readFile(path.join(project, 'project.config.json'), 'utf8'))
        expect(config.appid).toBe('wx6ffee4673b257014')
        throw new Error('停止本轮探针')
      }
      return { success: true }
    })
    await expect(wechat({ ...context, dir, phase: 'prepare', binding: { command: cli } })).rejects.toThrow('停止本轮探针')
    expect(run).not.toHaveBeenCalled()
  })

  it('微信页面元数据未就绪时等待，返回旧页面时不得点击或重启旧页面', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'wt-preflight-wechat-'))
    dirs.push(dir)
    const cli = path.join(dir, 'cli')
    await writeFile(cli, '')
    await mkdir(path.join(dir, 'package.nw'))
    await writeFile(path.join(dir, 'package.nw', 'package.json'), JSON.stringify({ name: '微信开发者工具', version: '2.02.2608070' }))
    run.mockResolvedValue('{"login":true}')
    const tap = vi.fn()
    const reLaunch = vi.fn()
    const mini = Object.assign({}, {
      currentPage: vi.fn().mockRejectedValueOnce(new Error('page metadata is not ready')).mockResolvedValue({ $: async () => ({ text: async () => 'old-run', tap }) }),
      reLaunch,
      screenshot: vi.fn().mockRejectedValue(new Error('no image')),
      disconnect: vi.fn(),
    })
    vi.spyOn(Launcher.prototype, 'connect').mockResolvedValue(mini as unknown as MiniProgram)
    await expect(wechat({ ...context, dir, phase: 'prepare', binding: { command: cli } })).rejects.toThrow('actual=old-run')
    expect(tap).not.toHaveBeenCalled()
    expect(mini.currentPage).toHaveBeenCalledTimes(2)
    expect(reLaunch).not.toHaveBeenCalled()
    expect(wechatRequest).toHaveBeenLastCalledWith('12345', { kind: 'close', project: path.join(dir, 'wechat-project') }, 10_000)
    expect(mini.disconnect).toHaveBeenCalledTimes(1)
    expect(run).not.toHaveBeenCalled()
  })

  it('CLI 安装边界支持 Windows 盘符、反斜杠与中文空格', () => {
    expect(wechatVersionCandidates('C:\\Program Files\\微信\\cli.bat', 'win32')).toContain('C:\\Program Files\\微信\\package.nw\\package.json')
    expect(wechatVersionCandidates('/Applications/微信 开发工具.app/Contents/MacOS/cli', 'darwin')[0]).toBe('/Applications/微信 开发工具.app/Contents/Resources/app.asar.unpacked/package.json')
  })

  it('微信 CLI 返回后等待异步自动化服务，持续不可用则超时阻断', async () => {
    const mini = {} as MiniProgram
    const connect = vi.spyOn(Launcher.prototype, 'connect').mockRejectedValueOnce(new Error('ECONNREFUSED')).mockResolvedValue(mini)
    await expect(connectWechat(12345, 500)).resolves.toBe(mini)
    expect(connect).toHaveBeenCalledTimes(2)
    connect.mockRejectedValue(new Error('ECONNREFUSED'))
    await expect(connectWechat(12345, 10)).rejects.toThrow('ECONNREFUSED')
  })

  it('运行设备与截图设备配置冲突时阻断', () => {
    vi.stubEnv('E2E_HBUILDERX_ANDROID_DEVICE_ID', 'a')
    vi.stubEnv('E2E_HBUILDERX_ANDROID_SCREENSHOT_DEVICE_ID', 'b')
    expect(() => requestedTarget(['E2E_HBUILDERX_ANDROID_DEVICE_ID', 'E2E_HBUILDERX_ANDROID_SCREENSHOT_DEVICE_ID'])).toThrow('歧义')
  })

  it.each(['LYNX_ANDROID_DEVICE_ID', 'ANDROID_SERIAL'])('Android 预检拒绝与 %s 不同的设备', async (key) => {
    vi.stubEnv('RN_ANDROID_DEVICE_ID', 'selected')
    vi.stubEnv(key, 'other')
    run.mockImplementation(async (_file, args) => {
      if (args[0] === 'version') {
        return 'adb 1'
      }
      if (args[0] === 'devices') {
        return 'selected device\nother device'
      }
      return '1'
    })
    await expect(android(context)).rejects.toThrow('歧义')
  })

  it('iOS 目标解析拒绝 Lynx、RN 与 destination 之间的冲突', () => {
    const keys = ['E2E_HBUILDERX_IOS_DEVICE_ID', 'RN_IOS_DEVICE_ID', 'LYNX_IOS_DEVICE_ID']
    expect(() => requestedIosTarget(keys, { RN_IOS_DEVICE_ID: 'selected', LYNX_IOS_DEVICE_ID: 'other' })).toThrow('歧义')
    expect(() => requestedIosTarget(keys, { E2E_HBUILDERX_IOS_DEVICE_ID: 'selected', LYNX_IOS_DESTINATION: 'platform=iOS Simulator,id=other' })).toThrow('歧义')
    expect(requestedIosTarget(keys, { LYNX_IOS_DESTINATION: 'platform=iOS Simulator,id=selected' })).toBe('selected')
  })

  it('等待可观察的异步渲染，不把 tap 返回当成 setData 已提交', async () => {
    const read = vi.fn().mockResolvedValueOnce(false).mockResolvedValue(true)
    await expect(waitForProbe(read, value => value === true, 500)).resolves.toBe(true)
    await expect(waitForProbe(async () => false, value => value === true, 10)).rejects.toThrow('未就绪')
  })

  it('浏览器能打开但交互失败时阻断，并关闭本次浏览器', async () => {
    const click = vi.fn().mockRejectedValue(new Error('click timeout'))
    const page = { setDefaultTimeout: vi.fn(), goto: vi.fn(), locator: () => ({ textContent: async () => context.runId, fill: vi.fn(), click }) }
    const close = vi.fn()
    vi.spyOn(chromium, 'launch').mockResolvedValue({ newPage: async () => page, close } as never)
    await expect(web(context)).rejects.toThrow('click timeout')
    expect(close).toHaveBeenCalledTimes(1)
  })

  it('CLI 存在但缺少 HBuilderX 编译组件时阻断', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'wt-preflight-hx-'))
    dirs.push(dir)
    await mkdir(path.join(dir, 'plugins'))
    await expect(hbuilderxTools(path.join(dir, 'cli'))).rejects.toThrow('uniapp-cli-vite')
  })

  it('显式 Android SDK 不可用时不自动改用其他安装', async () => {
    vi.stubEnv('ANDROID_HOME', path.resolve('missing-sdk'))
    run.mockRejectedValue(new Error('selected SDK unavailable'))
    await expect(android(context)).rejects.toThrow('selected SDK unavailable')
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('HBuilderX host 版本不符时阻断，不调用项目关闭或重启', async () => {
    run.mockResolvedValue('5.25.2026082902-alpha')
    await expect(hbuilderx({ ...context, binding: { command: 'cli', host: 'selected', version: '5.24.2026081301' } })).rejects.toThrow('版本改变')
    expect(run).toHaveBeenCalledTimes(1)
    expect(run.mock.calls[0]?.[1]).toEqual(['version', '--host', 'selected'])
  })

  it('即使子进程忽略 SIGTERM，探针超时仍终止自身进程树', async () => {
    await expect(runOwnedWorker({ command: process.execPath, args: ['-e', 'process.on("SIGTERM",()=>{});setInterval(()=>{},1000)'], cwd: process.cwd(), timeoutMs: 80 })).rejects.toThrow('超时')
  })

  it('中断会结束本次 worker，不执行延迟副作用', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'wt-preflight-process-'))
    dirs.push(dir)
    const marker = path.join(dir, 'unexpected.txt')
    const controller = new AbortController()
    const running = runOwnedWorker({ command: process.execPath, args: ['-e', 'setTimeout(()=>require("node:fs").writeFileSync(process.argv[1],"late"),1500)', marker], cwd: dir, timeoutMs: 5000 }, controller.signal)
    controller.abort()
    await expect(running).rejects.toThrow('中断')
    await expect(readFile(marker, 'utf8')).rejects.toThrow()
  })

  it('带中文、空格和 & 的 cwd、参数不会被 shell 重新解释', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'wt-preflight-path-'))
    dirs.push(dir)
    const cwd = path.join(dir, '中文 & 空格')
    await mkdir(cwd)
    const marker = path.join(cwd, 'input.txt')
    await writeFile(marker, 'expected')
    const result = await runOwnedWorker({ command: process.execPath, args: ['-e', 'console.log(require("node:fs").readFileSync(process.argv[1],"utf8"))', marker], cwd, timeoutMs: 5000 })
    expect(result.trim()).toBe('expected')
  })
})
