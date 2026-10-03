import type { ChildProcess } from 'node:child_process'
import type { CaseResult } from '../scripts/demo-visual-e2e-report/types'
import type { AppCase } from './hbuilderx-local/cases'
import { ChildProcess as TestChild } from 'node:child_process'
import { createHash } from 'node:crypto'
import { lstat, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { PassThrough } from 'node:stream'
import { PNG } from 'pngjs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { runAppCase } from '../scripts/demo-visual-e2e-report/app'
import { runNativeVisualCases } from '../scripts/demo-visual-e2e-report/app-batch'
import { findNativeCleanupBlock } from '../scripts/hbuilderx-native-session'

const state = vi.hoisted(() => ({
  child: undefined as ChildProcess | undefined,
  version: '5.14.2026070101-alpha',
  launchError: undefined as Error | undefined,
  openProject: vi.fn(),
  capture: vi.fn(),
  closeProject: vi.fn(),
  cleanupAlias: vi.fn(),
  closeError: false,
  logCloseError: false,
  launch: vi.fn(),
  stop: vi.fn(),
  screenshot: vi.fn(),
  restart: 'mutation' as 'mutation' | 'screenshot' | 'stop' | 'none',
  variants: 1,
  writeReport: vi.fn(),
}))
vi.mock('node:child_process', async importOriginal => ({
  ...await importOriginal<typeof import('node:child_process')>(),
  spawn: (_command: string, args: string[]) => {
    const child = Object.assign(new TestChild(), { stdout: new PassThrough(), stderr: new PassThrough() })
    state.screenshot(args)
    state.capture(args.at(-1))
    queueMicrotask(() => child.emit('close', 0, null))
    return child
  },
  spawnSync: (_command: string, args: string[]) => {
    if (args[0] === 'list' && args[1] === 'targets') {
      return { status: 0, stdout: 'test-harmony', stderr: '' }
    }
    if (args.includes('list')) {
      return { status: 0, stdout: JSON.stringify({ devices: { ios: [
        { udid: 'first-simulator', state: 'Booted' },
        { udid: 'second-simulator', state: 'Booted' },
      ] } }), stderr: '' }
    }
    if (args[0] === 'devices') {
      return { status: 0, stdout: 'emulator-5554 device\n', stderr: '' }
    }
    if (args.includes('screenshot')) {
      state.screenshot(args)
      state.capture(args.at(-1))
    }
    return { status: 0, stdout: '', stderr: '' }
  },
}))
vi.mock('./hbuilderx-local/process', () => ({
  assertAndroidToolchain: () => ({}),
  assertIosSimulatorToolchain: () => {},
  assertHarmonyToolchain: () => {},
  resolveHdcCommand: () => 'test-hdc',
  collectProcessOutput: () => [],
  createLocalHBuilderXRunner: async () => ({
    resolution: { channel: 'alpha', version: state.version },
    run: async (options: { args: string[], allowFailure?: boolean }) => {
      if (options.args[1] === 'open') {
        state.openProject(options)
      }
      if (options.args[1] === 'close') {
        state.closeProject(options)
        if (state.closeError && !options.allowFailure) {
          throw new Error('模拟项目关闭失败')
        }
      }
    },
    spawn: (options: unknown) => {
      state.launch(options)
      if (state.launchError) {
        throw state.launchError
      }
      return { child: state.child, logs: [], stop: state.stop }
    },
  }),
  fileExists: async () => true,
  hbuilderxAppTimeoutMs: 1000,
  pollIntervalMs: 1,
  readUtf8: (file: string) => readFile(file, 'utf8'),
  wait: async () => {},
}))
vi.mock('./hbuilderx-local/native-log', () => ({ captureNativeLog: () => ({ close: async () => {
  if (state.logCloseError) {
    throw new Error('模拟日志关闭失败')
  }
} }) }))
vi.mock('../scripts/demo-visual-e2e-report/harmony-output', () => ({ finalizeHarmonyAppOutput: async () => {} }))
vi.mock('../scripts/demo-visual-e2e-report/report', () => ({ writeReport: state.writeReport }))
vi.mock('./hbuilderx-local/render-mode', () => ({
  resolveAppRuntimeLogContract: () => ({ contains: [], notContains: [] }),
  findForbiddenRuntimeLogs: () => [],
}))
vi.mock('./hbuilderx-local/app-output', () => ({ readExistingAppTransformedOutput: async () => 'compiled' }))
vi.mock('./hbuilderx-local/app-marker', () => ({
  removeLegacyAppMarkers: (source: string) => source.replace('legacy-marker', ''),
  rewriteAppMarker: (_source: string, _anchors: string[], marker: { text: string }) => {
    if (marker.text === 'changed') {
      state.child!.stdout!.emit('data', '开始差量编译\n项目 fixture 编译成功。\n同步手机端程序文件成功\n')
      if (state.restart === 'mutation') {
        state.child!.stdout!.emit('data', 'App Launch at App.uvue:6\n')
      }
    }
    return marker.text
  },
}))
vi.mock('./hbuilderx-local/android-runtime', async importOriginal => ({
  ...await importOriginal<typeof import('./hbuilderx-local/android-runtime')>(),
  captureAndroidScreenshot: (file: string) => state.capture(file),
  resolveAdbCommand: () => 'adb',
  readAndroidUiHierarchy: async () => '<node text="current page" />',
  isAndroidDebugShell: () => false,
}))
vi.mock('../scripts/hbuilderx-project-alias.mjs', () => ({
  createHBuilderXProjectAlias: async (projectPath: string) => ({ projectPath, projectName: 'visual-test-alias', cleanup: state.cleanupAlias }),
}))
vi.mock('../scripts/demo-visual-e2e-report/style-isolation', () => ({
  readManifest: async () => undefined,
  resolveStyleIsolationVariants: () => Array.from({ length: state.variants }, () => ({})),
}))

describe('App 视觉入口的原生 HMR 生命周期', () => {
  const directories: string[] = []
  afterEach(async () => {
    await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
    state.version = '5.14.2026070101-alpha'
    state.launchError = undefined
    state.variants = 1
    vi.clearAllMocks()
    vi.unstubAllEnvs()
  })

  it.each((['app-android', 'app-ios'] as const).flatMap(platform =>
    (['mutation', 'screenshot', 'stop', 'none'] as const).flatMap(restart =>
      (['none', 'close', 'log-close', 'stop'] as const).map(cleanup => ({ platform, restart, cleanup }))),
  ))('$platform 视觉入口检查 $restart 与 $cleanup 收尾', async ({ platform, restart, cleanup }) => {
    state.stop.mockImplementation(async () => {
      if (cleanup === 'stop') {
        throw new Error('模拟受管进程停止失败')
      }
      if (state.restart === 'stop') {
        state.child!.stdout!.emit('data', 'App Launch at App.uvue:6\n')
      }
      Object.assign(state.child!, { exitCode: 0 })
      state.child!.emit('close', 0, null)
    })
    state.restart = restart
    state.closeError = cleanup === 'close' || cleanup === 'log-close'
    state.logCloseError = cleanup === 'log-close'
    for (const key of ['E2E_HBUILDERX_ANDROID_DEVICE_ID', 'E2E_HBUILDERX_ANDROID_SCREENSHOT_DEVICE_ID', 'ANDROID_SERIAL']) {
      vi.stubEnv(key, 'emulator-5554')
    }
    vi.stubEnv('E2E_HBUILDERX_IOS_TARGET', 'simulator')
    vi.stubEnv('E2E_HBUILDERX_IOS_DEVICE_ID', 'second-simulator')
    vi.stubEnv('E2E_HBUILDERX_IOS_SCREENSHOT_TARGET', 'second-simulator')
    const directory = await mkdtemp(join(tmpdir(), 'app-visual-lifecycle-'))
    directories.push(directory)
    const sourceFile = join(directory, 'App.uvue')
    const original = 'original source\r\nlegacy-marker\r\n'
    await writeFile(sourceFile, original)
    state.child = Object.assign(new TestChild(), { stdout: new PassThrough(), stderr: new PassThrough(), exitCode: restart === 'stop' ? null : 0 })
    const image = new PNG({ width: 20, height: 20 })
    image.data.fill(100)
    // 测试夹具只模拟截图传输成功；生产截图入口没有替代图兜底。
    const { writeFileSync } = await import('node:fs')
    state.capture.mockImplementation((file: string) => {
      if (platform === 'app-ios') {
        const color = state.capture.mock.calls.length === 1 ? [16, 41, 56] : [59, 7, 100]
        for (let pixel = 0; pixel < image.width * image.height; pixel++) {
          image.data.set([...color, 255], pixel * 4)
        }
      }
      writeFileSync(file, PNG.sync.write(image))
      if (restart === 'screenshot' && state.capture.mock.calls.length === 2) {
        state.child!.stderr!.emit('data', 'App Launch at App.uvue:6\n')
      }
    })
    const item: AppCase = {
      name: 'visual-lifecycle',
      platform,
      projectDir: directory,
      outputDir: 'dist',
      sourceFile: 'App.uvue',
      markerAnchor: 'original source',
      markerClass: platform === 'app-ios' ? 'w-[20px] h-[20px] bg-[#102938]' : '',
      markerText: 'initial',
      hmrMarkerClass: platform === 'app-ios' ? 'w-[20px] h-[20px] bg-[#3b0764]' : '',
      hmrMarkerText: 'changed',
      requiredFiles: [],
      transformedContains: ['compiled'],
      hmrTransformedContains: ['compiled'],
    }
    const results: CaseResult[] = []
    state.variants = cleanup === 'stop' ? 2 : 1
    const error = await runNativeVisualCases(cleanup === 'stop' ? [item, { ...item, name: 'must-not-start' }] : [item], { repoRoot: directory, artifactRoot: join(directory, 'artifacts'), timeoutMs: 1000, viewport: { width: 20, height: 20 } }, results).catch(error => error)
    expect(state.capture).toHaveBeenCalled()
    expect(state.stop).toHaveBeenCalledWith('SIGINT')
    expect(results).toHaveLength(1)
    expect(results[0]).toMatchObject({ status: restart === 'none' && cleanup === 'none' ? 'passed' : 'failed' })
    if (restart !== 'none' && !(restart === 'stop' && cleanup === 'stop')) {
      expect(results[0].error).toContain('restarted')
    }
    if (cleanup === 'stop') {
      expect(results[0].error).toContain('模拟受管进程停止失败')
      const blocked = findNativeCleanupBlock(error)!
      expect(blocked).toBeDefined()
      const recovery = JSON.parse(await readFile(join(blocked.recoveryDirectory, 'recovery.json'), 'utf8'))
      const sourcePath = await realpath(sourceFile)
      const source = recovery.files.find((file: { file: string }) => file.file === sourcePath)
      expect(source.sha256).toBe(createHash('sha256').update(original).digest('hex'))
      expect(await readFile(join(blocked.recoveryDirectory, source.backup), 'utf8')).toBe(original)
      expect(state.launch).toHaveBeenCalledTimes(1)
      expect(state.writeReport).toHaveBeenCalledOnce()
      expect(state.closeProject).not.toHaveBeenCalled()
      expect(state.cleanupAlias).not.toHaveBeenCalled()
      expect(await readFile(sourceFile, 'utf8')).toBe('changed')
    }
    else {
      expect(error).toBeUndefined()
      expect(state.closeProject).toHaveBeenCalledWith(expect.objectContaining({ allowFailure: false }))
      expect(await readFile(sourceFile, 'utf8')).toBe(original)
    }
    if (cleanup === 'close' || cleanup === 'log-close') {
      expect(results[0].error).toContain('模拟项目关闭失败')
      expect(state.cleanupAlias).not.toHaveBeenCalled()
    }
    if (cleanup === 'log-close') {
      expect(results[0].error).toContain('模拟日志关闭失败')
    }
    expect(state.child.stdout!.listenerCount('data')).toBe(0)
    if (platform === 'app-ios') {
      expect(state.launch).toHaveBeenCalledWith(expect.objectContaining({
        args: expect.arrayContaining(['--deviceId', 'second-simulator']),
      }))
      expect(state.screenshot).toHaveBeenCalledWith(expect.arrayContaining(['io', 'second-simulator', 'screenshot']))
    }
  })

  it('Alpha 5.31 Harmony 视觉入口启动失败也不打开或关闭真实项目', async () => {
    state.version = '5.31.2026093020-alpha'
    state.launchError = new Error('模拟 Harmony 启动失败')
    vi.stubEnv('E2E_HBUILDERX_HARMONY_DEVICE_ID', 'test-harmony')
    const directory = await mkdtemp(join(tmpdir(), 'app-visual-harmony-'))
    directories.push(directory)
    const linked = join(directory, 'worktree-link')
    const project = join(directory, 'project')
    await mkdir(project)
    await symlink(project, linked, process.platform === 'win32' ? 'junction' : 'dir')
    await writeFile(join(project, 'App.uvue'), 'original source')
    const results: CaseResult[] = []
    await runAppCase({
      name: 'harmony-project',
      platform: 'app-harmony',
      projectDir: linked,
      outputDir: 'dist',
      sourceFile: 'App.uvue',
      markerAnchor: 'original source',
      markerClass: '',
      markerText: 'initial',
      hmrMarkerClass: '',
      hmrMarkerText: 'changed',
      requiredFiles: [],
      transformedContains: [],
      hmrTransformedContains: [],
    }, { repoRoot: directory, artifactRoot: join(directory, 'artifacts'), timeoutMs: 1000, viewport: { width: 20, height: 20 } }, results)
    expect(results[0]).toMatchObject({ status: 'failed', error: expect.stringContaining('模拟 Harmony 启动失败') })
    expect(state.launch).toHaveBeenCalledWith(expect.objectContaining({
      args: ['launch', 'app-harmony', '--project', await realpath(project), '--deviceId', 'test-harmony'],
      cwd: await realpath(project),
    }))
    expect(state.openProject).not.toHaveBeenCalled()
    expect(state.closeProject).not.toHaveBeenCalled()
    expect(state.cleanupAlias).not.toHaveBeenCalled()
    expect(state.stop).not.toHaveBeenCalled()
    expect(await readFile(join(project, 'App.uvue'), 'utf8')).toBe('original source')
    expect((await lstat(linked)).isSymbolicLink()).toBe(true)
  })
})
