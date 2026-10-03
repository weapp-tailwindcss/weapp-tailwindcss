import type { HBuilderXCommandOptions } from '../packages/hbuilderx-runner/src/types'
import { lstat, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { launchHBuilderXMiniProgram } from '../scripts/hbuilderx-launch-mp-weixin-dev'
import { withIssue1144Setup } from './hbuilderx-local/issue-1144-source'
import { compileMiniProgramWithHBuilderX, verifyAppHmrWithHBuilderX } from './hbuilderx-local/runner'
import { createHBuilderXDevServer } from './hbuilderx-local/web/dev-server'

const state = vi.hoisted(() => ({
  aliasRoot: '',
  alias: undefined as { projectPath: string, projectName: string, cleanup: () => Promise<void> } | undefined,
  closeError: undefined as Error | undefined,
  launchError: undefined as Error | undefined,
  spawnError: undefined as Error | undefined,
  exitCode: 0,
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
  createLocalHBuilderXRunner: async () => ({
    resolution: { channel: 'alpha', version: '5.14.2026070101-alpha' },
    run: state.run,
    spawn: state.spawn,
    openProject: (options: { cwd: string }) => state.run({ ...options, args: ['project', 'open', '--path', options.cwd] }),
    closeProject: (options: { cwd: string }) => state.run({ ...options, args: ['project', 'close', '--path', options.cwd] }),
  }),
}))
vi.mock('./hbuilderx-local/app-target', async importOriginal => ({
  ...await importOriginal<typeof import('./hbuilderx-local/app-target')>(),
  bindAppTarget: (item: unknown) => item,
}))
vi.mock('../packages/hbuilderx-runner/src/index', async importOriginal => ({
  ...await importOriginal<typeof import('../packages/hbuilderx-runner/src/index')>(),
  createHBuilderXRunner: async () => ({
    resolution: { channel: 'alpha', host: 'test-host', path: 'test-cli', version: '5.0-test' },
    run: state.run,
    spawn: state.spawn,
  }),
}))

let root: string
let projectRoot: string
beforeEach(async () => {
  vi.stubEnv('HBUILDERX_COMPILE_ONLY', '1')
  root = await mkdtemp(path.join(tmpdir(), 'hbuilderx-alias-consumer-'))
  projectRoot = path.join(root, 'project')
  await mkdir(projectRoot)
  state.aliasRoot = path.join(root, 'aliases')
  state.alias = undefined
  state.closeError = undefined
  state.launchError = undefined
  state.spawnError = undefined
  state.exitCode = 0
  state.stop.mockReset().mockResolvedValue(undefined)
  state.run.mockReset().mockImplementation(async (options: HBuilderXCommandOptions) => {
    const [command, action] = options.args
    if (command === 'project' && action === 'close' && state.closeError) {
      // 模拟 runner 的真实 allowFailure 语义，防止宽松关闭返回值漏测。
      if (!options.allowFailure) {
        throw state.closeError
      }
      return { exit: { code: 1, signal: null }, issue: { kind: 'process-exit' }, output: state.closeError.message }
    }
    if (command === 'launch' && state.launchError) {
      throw state.launchError
    }
    return { exit: { code: 0, signal: null }, issue: { kind: 'unknown' }, output: ` - ${state.alias?.projectName}(${state.alias?.projectPath})` }
  })
  state.spawn.mockReset().mockImplementation(() => {
    if (state.spawnError) {
      throw state.spawnError
    }
    return { child: {}, closed: Promise.resolve({ code: state.exitCode, signal: null }), stop: state.stop }
  })
})
afterEach(async () => {
  vi.unstubAllEnvs()
  await rm(root, { recursive: true, force: true })
})

function miniCase() {
  return { name: 'alias-consumer', platform: 'mp-weixin' as const, projectDir: projectRoot, outputDir: 'dist', requiredFiles: [], cssExtensions: [], cssContains: [], workflow: { staticTemplateClass: true, dynamicClassBinding: false, userAuthoredStyle: false, thirdPartyOrExternalComponentStyle: false, subpackageStyle: false, webHmr: false } }
}

function expectCombined(error: unknown, primary: unknown, close: unknown) {
  expect(error).toBeInstanceOf(AggregateError)
  expect(error).toMatchObject({ cause: primary })
  const errors = (error as AggregateError).errors
  expect(errors[0]).toBe(primary)
  expect(errors[1]).toMatchObject({ cause: close })
  expect(errors[1].message).toContain(state.alias!.projectPath)
}

it.each(['', 'false', 'true'])('拒绝模糊编译模式（%s），不回退到 HBuilderX 运行入口或修改产物', async (value) => {
  vi.stubEnv('HBUILDERX_COMPILE_ONLY', value)
  const debugFile = path.join(projectRoot, '.debug', 'existing.txt')
  const outputFile = path.join(projectRoot, 'unpackage', 'dist', 'dev', 'mp-weixin', 'app.json')
  for (const file of [debugFile, outputFile]) {
    await mkdir(path.dirname(file), { recursive: true })
    await writeFile(file, 'existing')
  }
  const listeners = [process.listenerCount('SIGINT'), process.listenerCount('SIGTERM')]
  await expect(launchHBuilderXMiniProgram(projectRoot)).rejects.toThrow('已阻断 HBuilderX 微信 watch')
  expect(state.run).not.toHaveBeenCalled()
  expect(state.spawn).not.toHaveBeenCalled()
  expect(state.alias).toBeUndefined()
  expect([process.listenerCount('SIGINT'), process.listenerCount('SIGTERM')]).toEqual(listeners)
  for (const file of [debugFile, outputFile]) {
    expect(await readFile(file, 'utf8')).toBe('existing')
  }
})

it('显式静态编译只传 compile=true，不能把一次性编译当成 watch 验收', async () => {
  await launchHBuilderXMiniProgram(projectRoot)
  expect(state.spawn).toHaveBeenCalledWith(expect.objectContaining({
    args: ['launch', 'mp-weixin', '--project', state.alias!.projectName, '--compile', 'true', '--runtime-log', 'true'],
  }))
  await expect(lstat(state.alias!.projectPath)).rejects.toMatchObject({ code: 'ENOENT' })
})

it('小程序编译与关闭同时失败时保留首因和真实别名', async () => {
  state.launchError = new Error('compile failed')
  state.closeError = new Error('close timed out')
  const error = await compileMiniProgramWithHBuilderX(miniCase()).catch(error => error)
  expectCombined(error, state.launchError, state.closeError)
  expect(await realpath(state.alias!.projectPath)).toBe(await realpath(projectRoot))
  expect(state.alias!.cleanup).not.toHaveBeenCalled()
  expect(state.run).toHaveBeenCalledWith(expect.objectContaining({ args: ['project', 'close', '--path', state.alias!.projectPath], allowFailure: false }))
})

it('小程序编译失败但关闭成功时删除别名并保留原异常对象', async () => {
  state.launchError = new Error('compile failed')
  await expect(compileMiniProgramWithHBuilderX(miniCase())).rejects.toBe(state.launchError)
  await expect(lstat(state.alias!.projectPath)).rejects.toMatchObject({ code: 'ENOENT' })
})

it('Web 启动与关闭同时失败仍恢复本轮修改的源码', async () => {
  const app = path.join(projectRoot, 'App.uvue')
  const page = path.join(projectRoot, 'pages', 'index', 'index.uvue')
  const original = '<template><view /></template><script lang="uts">export default {}</script><style>// author</style>'
  await mkdir(path.dirname(page), { recursive: true })
  await Promise.all([writeFile(app, original), writeFile(page, original)])
  state.spawnError = new Error('spawn failed')
  state.closeError = new Error('close timed out')
  const error = await withIssue1144Setup(projectRoot, () => createHBuilderXDevServer(projectRoot)).catch(error => error)
  expectCombined(error, state.spawnError, state.closeError)
  expect(await readFile(app, 'utf8')).toBe(original)
  expect(await readFile(page, 'utf8')).toBe(original)
  expect(await realpath(state.alias!.projectPath)).toBe(await realpath(projectRoot))
})

it('Web 服务关闭失败保留别名，确认关闭后才删除', async () => {
  const server = await createHBuilderXDevServer(projectRoot)
  state.closeError = new Error('close failed')
  await expect(server.cleanup()).rejects.toMatchObject({ cause: state.closeError })
  expect(state.alias!.cleanup).not.toHaveBeenCalled()
  expect(await realpath(state.alias!.projectPath)).toBe(await realpath(projectRoot))
  state.closeError = undefined
  await server.cleanup()
  await expect(lstat(state.alias!.projectPath)).rejects.toMatchObject({ code: 'ENOENT' })
})

it('独立开发脚本保留 launch 非零退出及关闭错误并移除信号监听器', async () => {
  const listeners = [process.listenerCount('SIGINT'), process.listenerCount('SIGTERM')]
  state.exitCode = 3
  state.closeError = new Error('close failed')
  const error = await launchHBuilderXMiniProgram(projectRoot).catch(error => error)
  expect(error).toBeInstanceOf(AggregateError)
  expect((error as AggregateError).errors[0].message).toContain('failed: 3')
  expect((error as AggregateError).errors[1]).toMatchObject({ cause: state.closeError })
  expect(await realpath(state.alias!.projectPath)).toBe(await realpath(projectRoot))
  expect([process.listenerCount('SIGINT'), process.listenerCount('SIGTERM')]).toEqual(listeners)
})

it('信号停止失败会结束开发脚本并执行项目收尾', async () => {
  const listeners = process.listeners('SIGTERM')
  const stopError = new Error('CLI stop failed')
  state.stop.mockRejectedValue(stopError)
  state.spawn.mockImplementation(() => ({ closed: new Promise(() => {}), stop: state.stop }))
  const result = launchHBuilderXMiniProgram(projectRoot)
  await vi.waitFor(() => expect(process.listeners('SIGTERM').length).toBe(listeners.length + 1))
  const handler = process.listeners('SIGTERM').find(listener => !listeners.includes(listener))!
  handler('SIGTERM')
  await expect(result).rejects.toBe(stopError)
  expect(process.listeners('SIGTERM')).toEqual(listeners)
  await expect(lstat(state.alias!.projectPath)).rejects.toMatchObject({ code: 'ENOENT' })
})

it.each([0, 3])('根进程退出 %s 后仍等待已发起的进程树停止，保留晚到清理失败', async (code) => {
  const listeners = process.listeners('SIGTERM')
  const stopError = new Error('descendant stop failed')
  let resolveRoot!: (exit: { code: number, signal: null }) => void
  let rejectStop!: (error: Error) => void
  const closed = new Promise<{ code: number, signal: null }>((resolve) => {
    resolveRoot = resolve
  })
  const stopping = new Promise<void>((_resolve, reject) => {
    rejectStop = reject
  })
  state.stop.mockReturnValue(stopping)
  state.spawn.mockImplementation(() => ({ closed, stop: state.stop }))
  const result = launchHBuilderXMiniProgram(projectRoot)
  await vi.waitFor(() => expect(process.listeners('SIGTERM').length).toBe(listeners.length + 1))
  process.listeners('SIGTERM').find(listener => !listeners.includes(listener))!('SIGTERM')
  resolveRoot({ code, signal: null })
  await new Promise(resolve => setImmediate(resolve))
  expect(state.run.mock.calls.filter(([options]) => options.args[1] === 'close')).toHaveLength(0)
  rejectStop(stopError)
  const error = await result.catch(error => error)
  if (code === 0) {
    expect(error).toBe(stopError)
  }
  else {
    expect(error).toBeInstanceOf(AggregateError)
    expect(error.errors[0].message).toContain('failed: 3')
    expect(error.errors[1]).toBe(stopError)
  }
  expect(process.listeners('SIGTERM')).toEqual(listeners)
  await expect(lstat(state.alias!.projectPath)).rejects.toMatchObject({ code: 'ENOENT' })
})

it('App 项目打开与关闭同时失败后仍恢复本轮源码并保留别名', async () => {
  const source = path.join(projectRoot, 'App.uvue')
  const original = '<template><view>original</view></template>'
  await writeFile(source, original)
  vi.stubEnv('E2E_HBUILDERX_RUNTIME_EVIDENCE_ROOT', path.join(root, 'evidence'))
  const openError = new Error('open failed after registration')
  state.closeError = new Error('close failed')
  state.run.mockImplementationOnce(async (options: HBuilderXCommandOptions) => {
    expect(options.args[1]).toBe('open')
    expect(await readFile(source, 'utf8')).toContain('native-hmr-probe')
    throw openError
  })
  const error = await verifyAppHmrWithHBuilderX({
    name: 'alias-app-consumer',
    platform: 'app-ios',
    projectDir: projectRoot,
    outputDir: 'dist',
    sourceFile: 'App.uvue',
    markerAnchor: '<view>',
    markerClass: 'bg-red-500',
    markerText: 'initial',
    hmrMarkerClass: 'bg-blue-500',
    hmrMarkerText: 'changed',
    requiredFiles: [],
    transformedContains: [],
    hmrTransformedContains: [],
  }).catch(error => error)
  expectCombined(error, openError, state.closeError)
  expect(await readFile(source, 'utf8')).toBe(original)
  expect(await realpath(state.alias!.projectPath)).toBe(await realpath(projectRoot))
})
