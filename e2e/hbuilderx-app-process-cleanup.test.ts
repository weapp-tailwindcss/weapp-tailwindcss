import type { ChildProcess } from 'node:child_process'
import type { CommandExit, HBuilderXNativeCommandOptions } from '../packages/hbuilderx-runner/src/types'
import type { AppCase } from './hbuilderx-local/cases'
import { EventEmitter } from 'node:events'
import { mkdirSync, writeFileSync } from 'node:fs'
import { lstat, mkdir, mkdtemp, readdir, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { PassThrough } from 'node:stream'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { findNativeCleanupBlock } from '../scripts/hbuilderx-native-session'
import { verifyAppHmrWithHBuilderX } from './hbuilderx-local/runner'
import { prepareNativeFixture } from './hbuilderx-native-fixture'

const state = vi.hoisted(() => ({
  aliasRoot: '',
  cli: '',
  version: '5.14.2026070101-alpha',
  alias: undefined as { projectPath: string, cleanup: () => Promise<void> } | undefined,
  captureError: undefined as Error | undefined,
  closeError: undefined as Error | undefined,
  logCloseError: undefined as Error | undefined,
  updateOutput: '',
  kill: vi.fn(),
  run: vi.fn(),
  spawn: vi.fn(),
  stop: vi.fn(),
}))
vi.mock('../scripts/hbuilderx-project-alias.mjs', async (importOriginal) => {
  const original = await importOriginal<typeof import('../scripts/hbuilderx-project-alias.mjs')>()
  return {
    ...original,
    createHBuilderXProjectAlias: async (projectRoot: string) => {
      const alias = await original.createHBuilderXProjectAlias(projectRoot, state.aliasRoot)
      state.alias = { ...alias, cleanup: vi.fn(alias.cleanup) }
      return state.alias
    },
  }
})
vi.mock('./hbuilderx-local/process', async importOriginal => ({
  ...await importOriginal<typeof import('./hbuilderx-local/process')>(),
  assertIosSimulatorToolchain: () => {},
  assertHarmonyToolchain: () => {},
  killProcessTree: state.kill,
  wait: async () => {},
  createLocalHBuilderXRunner: async () => ({
    resolution: { path: state.cli, host: 'test-host', channel: 'alpha', version: state.version },
    run: state.run,
    spawn: state.spawn,
  }),
}))
vi.mock('./hbuilderx-local/app-target', () => ({
  bindAppTarget: (item: unknown) => item,
  readAppLaunchOption: () => undefined,
}))
vi.mock('./hbuilderx-local/ios-runtime', () => ({
  waitForIosRuntimeEvidence: async ({ screenshot }: { screenshot: string }) => ({ screenshot }),
}))
vi.mock('./hbuilderx-local/harmony-runtime', () => ({
  waitForHarmonyRuntimeEvidence: async () => ({ pid: '100', afterPid: '100' }),
  captureHarmonyRuntimeEvidence: async () => ({}),
}))
vi.mock('./hbuilderx-local/hmr-lifecycle', async (importOriginal) => {
  const original = await importOriginal<typeof import('./hbuilderx-local/hmr-lifecycle')>()
  return {
    ...original,
    observeHmrStep: (...args: Parameters<typeof original.observeHmrStep>) => {
      const observer = original.observeHmrStep(...args)
      args[0].stdout!.emit('data', '开始差量编译\n项目 fixture 编译成功。\n同步手机端程序文件成功\n')
      args[0].stdout!.emit('data', `热更新完成\n${state.updateOutput}`)
      return observer
    },
  }
})
vi.mock('./hbuilderx-local/native-log', async (importOriginal) => {
  const original = await importOriginal<typeof import('./hbuilderx-local/native-log')>()
  return {
    ...original,
    captureNativeLog: (...args: Parameters<typeof original.captureNativeLog>) => {
      if (state.captureError) {
        throw state.captureError
      }
      const log = original.captureNativeLog(...args)
      return { async close() {
        await log.close()
        if (state.logCloseError) {
          throw state.logCloseError
        }
      } }
    },
  }
})

let root: string
let source: string
let item: AppCase
let child: ChildProcess
let closeRoot: () => void
const originalSource = '<template><view>original</view></template>'

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'hbuilderx-app-process-'))
  state.cli = (await prepareNativeFixture(root)).path
  const projectRoot = path.join(root, 'project')
  await mkdir(projectRoot)
  source = path.join(projectRoot, 'App.uvue')
  await writeFile(source, originalSource)
  vi.stubEnv('E2E_HBUILDERX_RUNTIME_EVIDENCE_ROOT', path.join(root, 'evidence'))
  state.version = '5.14.2026070101-alpha'
  state.aliasRoot = path.join(root, 'aliases')
  state.alias = undefined
  state.captureError = undefined
  state.closeError = undefined
  state.logCloseError = undefined
  state.updateOutput = ''
  state.kill.mockReset()
  state.run.mockReset().mockImplementation(async (options: HBuilderXNativeCommandOptions) => {
    if (options.args[1] === 'close' && state.closeError) {
      throw state.closeError
    }
    return { exit: { code: 0, signal: null }, issue: { kind: 'unknown' }, output: '' }
  })
  child = Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough(), exitCode: null, signalCode: null }) as unknown as ChildProcess
  const closed = new Promise<CommandExit>((resolve) => {
    closeRoot = () => {
      Object.assign(child, { exitCode: 0 })
      child.emit('close', 0, null)
      resolve({ code: 0, signal: null })
    }
  })
  state.stop.mockReset().mockImplementation(async () => closeRoot())
  state.spawn.mockReset().mockImplementation(() => {
    mkdirSync(path.join(projectRoot, 'dist'), { recursive: true })
    writeFileSync(path.join(projectRoot, 'dist', 'app.js'), 'compiled')
    return { child, closed, stop: state.stop, logs: [], ensureRunning() {} }
  })
  item = {
    name: 'app-process-consumer',
    platform: 'app-ios',
    projectDir: projectRoot,
    outputDir: 'dist',
    sourceFile: 'App.uvue',
    markerAnchor: '<view>',
    markerClass: 'bg-red-500',
    markerText: 'initial',
    hmrMarkerClass: 'bg-blue-500',
    hmrMarkerText: 'changed',
    requiredFiles: ['app.js'],
    transformedOutputFiles: ['app.js'],
    transformedContains: ['compiled'],
    hmrTransformedContains: ['compiled'],
  }
})

afterEach(async () => {
  child.stdout?.destroy()
  child.stderr?.destroy()
  vi.unstubAllEnvs()
  await rm(root, { recursive: true, force: true })
})

function projectCloseCalls() {
  return state.run.mock.calls.filter(([options]) => options.args[1] === 'close')
}

it.each([null, 0])('根进程 exitCode=%s 时仍等受管进程树停止后恢复源码和关闭项目', async (exitCode) => {
  Object.assign(child, { exitCode })
  let releaseStop!: () => void
  state.stop.mockReturnValue(new Promise<void>((resolve) => {
    releaseStop = resolve
  }))
  const result = verifyAppHmrWithHBuilderX(item)
  await vi.waitFor(() => expect(state.stop).toHaveBeenCalledExactlyOnceWith('SIGINT'))
  closeRoot()
  await new Promise(resolve => setImmediate(resolve))
  expect(projectCloseCalls()).toHaveLength(0)
  expect(await readFile(source, 'utf8')).toContain('changed')
  releaseStop()
  await result
  expect(projectCloseCalls()).toHaveLength(1)
  expect(await readFile(source, 'utf8')).toBe(originalSource)
  expect(state.kill).not.toHaveBeenCalled()
  expect(state.stop).toHaveBeenCalledTimes(1)
  await expect(lstat(state.alias!.projectPath)).rejects.toMatchObject({ code: 'ENOENT' })
})

it('进程树停止失败必须冻结当前源码和别名，不能关闭项目', async () => {
  const stopError = new Error('owned descendant did not close')
  state.stop.mockRejectedValue(stopError)
  await expect(verifyAppHmrWithHBuilderX(item)).rejects.toThrow()
  expect(state.stop).toHaveBeenCalledExactlyOnceWith('SIGINT')
  expect(await readFile(source, 'utf8')).toContain('changed')
  expect(projectCloseCalls()).toHaveLength(0)
  expect(await realpath(state.alias!.projectPath)).toBe(await realpath(item.projectDir))
  expect(child.stdout!.listenerCount('data')).toBe(0)
})

it('验证、进程树停止和日志关闭同时失败时保留三处原因及别名', async () => {
  state.updateOutput = 'App Launch'
  state.logCloseError = new Error('native log close failed')
  const stopError = new Error('process tree stop failed')
  state.stop.mockRejectedValue(stopError)
  const error = await verifyAppHmrWithHBuilderX(item).catch(error => error)
  expect(error).toBeInstanceOf(AggregateError)
  expect(error.cause.message).toContain('restarted')
  const block = findNativeCleanupBlock(error)!
  expect(block.errors).toEqual(expect.arrayContaining([stopError, state.logCloseError]))
  expect(state.stop).toHaveBeenCalledExactlyOnceWith('SIGINT')
  expect(await readFile(source, 'utf8')).toContain('changed')
  expect(await realpath(state.alias!.projectPath)).toBe(await realpath(item.projectDir))
  expect(state.alias!.cleanup).not.toHaveBeenCalled()
  expect(projectCloseCalls()).toHaveLength(0)
  expect(JSON.parse(await readFile(path.join(block.recoveryDirectory, 'blocked.json'), 'utf8')).primaryError).toContain('restarted')
})

it.each(['mutation', 'stop'])('Harmony %s 时观测到 fallback 后，即使 CLI stop 成功仍冻结源码', async (phase) => {
  if (phase === 'mutation') {
    state.updateOutput = '热更新失败\n开始构建鸿蒙工程'
  }
  else {
    state.stop.mockImplementation(async () => {
      child.stdout!.emit('data', '热更新失败\n开始构建鸿蒙工程')
      closeRoot()
    })
  }
  const error = await verifyAppHmrWithHBuilderX({ ...item, platform: 'app-harmony' }).catch(error => error)
  const block = findNativeCleanupBlock(error)!
  expect(block).toBeDefined()
  expect(await readFile(source, 'utf8')).toContain('changed')
  expect(projectCloseCalls()).toHaveLength(0)
  expect(state.alias!.cleanup).not.toHaveBeenCalled()
  expect(child.stdout!.listenerCount('data')).toBe(0)
  const recovery = JSON.parse(await readFile(path.join(block.recoveryDirectory, 'recovery.json'), 'utf8'))
  expect(await readFile(path.join(block.recoveryDirectory, recovery.files[0].backup), 'utf8')).toBe(originalSource)
})

it('已有 Harmony 主错误时，stop 期间迟到的重装仍阻断并保留新错误', async () => {
  state.updateOutput = 'App Launch'
  state.stop.mockImplementation(async () => {
    child.stdout!.emit('data', '安装 .hap 到鸿蒙设备')
    closeRoot()
  })
  const error = await verifyAppHmrWithHBuilderX({ ...item, platform: 'app-harmony' }).catch(error => error)
  expect(error.cause.message).toContain('restarted')
  const block = findNativeCleanupBlock(error)!
  expect(block.errors.some((item: Error) => item.message.includes('reinstalled'))).toBe(true)
  expect(await readFile(source, 'utf8')).toContain('changed')
  expect(projectCloseCalls()).toHaveLength(0)
})

it('恢复资料写入失败时不创建 alias、不改源码也不 launch', async () => {
  const evidenceRoot = path.join(root, 'not-a-directory')
  await writeFile(evidenceRoot, 'occupied')
  vi.stubEnv('E2E_HBUILDERX_RUNTIME_EVIDENCE_ROOT', evidenceRoot)
  await expect(verifyAppHmrWithHBuilderX(item)).rejects.toThrow()
  expect(state.spawn).not.toHaveBeenCalled()
  expect(state.alias).toBeUndefined()
  expect(await readFile(source, 'utf8')).toBe(originalSource)
  expect(await readdir(item.projectDir)).toEqual(['App.uvue'])
})

it('停止期间最后到达的 HMR 失败仍使验收失败并释放日志监听', async () => {
  state.stop.mockImplementation(async () => {
    child.stdout!.emit('data', '热更新失败')
    closeRoot()
  })
  await expect(verifyAppHmrWithHBuilderX(item)).rejects.toThrow('纯 HMR 验收失败：failed')
  expect(projectCloseCalls()).toHaveLength(1)
  expect(child.stdout!.listenerCount('data')).toBe(0)
  expect(await readFile(source, 'utf8')).toBe(originalSource)
})

it.each(['absolute', 'relative'])('Alpha 5.31 Harmony 使用 %s 输入的真实根，不打开或关闭用户同名项目', async (input) => {
  state.version = '5.31.2026093020-alpha'
  const projectLink = path.join(root, '中文 worktree (link)')
  await symlink(item.projectDir, projectLink, process.platform === 'win32' ? 'junction' : 'dir')
  const canonicalRoot = await realpath(item.projectDir)
  const sameNameProject = path.join(root, 'user', path.basename(item.projectDir))
  await mkdir(sameNameProject, { recursive: true })
  await writeFile(path.join(sameNameProject, 'App.uvue'), 'user source')
  state.captureError = new Error('在启动后中断，不执行设备探针')
  await expect(verifyAppHmrWithHBuilderX({
    ...item,
    platform: 'app-harmony',
    projectDir: input === 'relative' ? path.relative(process.cwd(), projectLink) : projectLink,
  })).rejects.toBe(state.captureError)
  expect(state.spawn).toHaveBeenCalledWith(expect.objectContaining({
    args: ['launch', 'app-harmony', '--project', canonicalRoot, '--cleanCache', 'true'],
    cwd: canonicalRoot,
  }))
  expect(state.run).not.toHaveBeenCalled()
  expect(state.alias).toBeUndefined()
  expect(state.stop).toHaveBeenCalledExactlyOnceWith('SIGINT')
  expect(await readFile(source, 'utf8')).toBe(originalSource)
  expect(await readFile(path.join(sameNameProject, 'App.uvue'), 'utf8')).toBe('user source')
  expect((await lstat(projectLink)).isSymbolicLink()).toBe(true)
})
