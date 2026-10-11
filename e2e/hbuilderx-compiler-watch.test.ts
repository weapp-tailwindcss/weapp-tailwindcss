import { access, copyFile, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { launchHBuilderXMiniProgram } from '../scripts/hbuilderx-launch-mp-weixin-dev'
import { createWechatCompilerPlan, pluginRootCandidates } from '../scripts/hbuilderx/wechat-compiler'

let root: string
let project: string
let plugins: string
let cli: string
let entry: string
const compilerSource = `
const fs = require('node:fs')
const path = require('node:path')
const input = process.env.UNI_INPUT_DIR
const output = process.env.UNI_OUTPUT_DIR
const source = path.join(input, 'source.txt')
fs.mkdirSync(output, { recursive: true })
fs.writeFileSync(path.join(output, 'identity.json'), JSON.stringify({ pid: process.pid, args: process.argv.slice(2), cwd: process.cwd() }))
function compile() { fs.writeFileSync(path.join(output, 'app.json'), fs.readFileSync(source, 'utf8')) }
compile()
fs.watchFile(source, { interval: 20 }, compile)
`

async function save(file: string, data: string) {
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, data)
}

beforeEach(async () => {
  root = await realpath(await mkdtemp(path.join(tmpdir(), 'wechat-compiler-')))
  project = path.join(root, 'demo with space 中文')
  plugins = path.join(root, 'HBuilderX-Alpha', 'plugins')
  cli = path.join(root, 'HBuilderX-Alpha', process.platform === 'win32' ? 'cli.exe' : 'cli')
  entry = path.join(plugins, 'uniapp-cli-vite', 'node_modules', '@dcloudio', 'vite-plugin-uni', 'bin', 'uni.js')
  for (const [name, version] of [['about', '5.31.0-alpha'], ['node', '22.22.2'], ['uniapp-cli-vite', '5.31.0']]) {
    await save(path.join(plugins, name!, 'package.json'), JSON.stringify({ name, version }))
  }
  await save(cli, 'this CLI must never execute')
  const nodeTarget = path.join(plugins, 'node', process.platform === 'win32' ? 'node.exe' : 'node')
  if (process.platform === 'win32') {
    await copyFile(process.execPath, nodeTarget)
  }
  else {
    await symlink(process.execPath, nodeTarget)
  }
  await save(entry, compilerSource)
  await save(path.join(project, 'manifest.json'), '{ "name": "fixture" }')
  await save(path.join(project, 'source.txt'), 'initial')
  vi.stubEnv('HBUILDERX_CLI_PATH', cli)
  vi.stubEnv('HBUILDERX_CHANNEL', 'alpha')
})

afterEach(async () => {
  vi.unstubAllEnvs()
  await rm(root, { recursive: true, force: true })
})

it.each([
  ['POSIX', path.posix, '/opt/HBuilderX/cli', '/opt/HBuilderX/plugins'],
  ['macOS', path.posix, '/Applications/HBuilderX-Alpha.app/Contents/MacOS/cli', '/Applications/HBuilderX-Alpha.app/Contents/HBuilderX/plugins'],
  ['Windows', path.win32, 'C:\\HBuilderX\\cli.exe', 'C:\\HBuilderX\\plugins'],
  ['Windows 根目录', path.win32, 'C:\\cli.exe', 'C:\\plugins'],
  ['UNC', path.win32, '\\\\server\\share\\HBuilderX\\cli.exe', '\\\\server\\share\\HBuilderX\\plugins'],
  ['相对路径', path.posix, 'HBuilderX/cli', 'HBuilderX/plugins'],
] as const)('%s 安装路径使用对应路径 API', (_name, paths, command, expected) => {
  expect(pluginRootCandidates(command, paths)).toContain(expected)
})

it('从同一安装生成原生 dev watch 命令，清除旧 IDE RPC 和平台环境', async () => {
  const inherited = {
    HX_PLUGIN_PATHS: '{"uniapp-cli-vite":"/old/compiler"}',
    hx_plugin_paths: '{"uniapp-cli-vite":"/old/lowercase"}',
    uni_script: 'wrong-platform',
    Uni_Helpers_Dir: '/old/helpers',
    pipe_name: 'old-lowercase-pipe',
    HX_APP_ROOT: '/old/app',
    UNI_INPUT_DIR: '/wrong/project',
    UNI_OUTPUT_DIR: '/wrong/output',
    UNI_APP_X: 'true',
    UNI_SCRIPT: 'different-platform',
    UNI_SOCKET_ID: 'old-socket',
    UNI_AUTOMATOR_WS_ENDPOINT: 'ws://old/',
    PIPE_NAME: 'old-ide',
    HBuilderProcessId: '1',
    VITEST: 'true',
    VITEST_POOL_ID: '1',
    VITE_ROOT_DIR: '/wrong/vite',
    NODE_ENV: 'production',
    UNI_CUSTOM_CONTEXT: 'custom',
    UNI_CUSTOM_DEFINE: '{"FLAG":true}',
    UNI_MINIMIZE: 'true',
    SOURCEMAP: 'true',
    PATH: process.env.PATH,
  }
  const plan = await createWechatCompilerPlan(project, { cliPath: cli, env: inherited })
  expect(plan.command).toBe(path.join(plugins, 'node', process.platform === 'win32' ? 'node.exe' : 'node'))
  expect(plan.args).toEqual(['--no-warnings', entry, '-p', 'mp-weixin'])
  expect(plan.cwd).toBe(path.join(plugins, 'uniapp-cli-vite'))
  expect(plan.env).toMatchObject({
    UNI_INPUT_DIR: project,
    UNI_OUTPUT_DIR: path.join(project, 'unpackage', 'dist', 'dev', 'mp-weixin'),
    UNI_PLATFORM: 'mp-weixin',
    HX_APP_ROOT: path.dirname(plugins),
    UNI_HBUILDERX_PLUGINS: plugins,
    HX_Version: '5.31.0-alpha',
    VITE_ROOT_DIR: project,
    NODE_ENV: 'development',
    UNI_CUSTOM_CONTEXT: 'custom',
    UNI_CUSTOM_DEFINE: '{"FLAG":true}',
    UNI_MINIMIZE: 'true',
    SOURCEMAP: 'true',
  })
  for (const key of ['HX_PLUGIN_PATHS', 'hx_plugin_paths', 'uni_script', 'Uni_Helpers_Dir', 'pipe_name', 'UNI_APP_X', 'UNI_SCRIPT', 'UNI_SOCKET_ID', 'UNI_AUTOMATOR_WS_ENDPOINT', 'PIPE_NAME', 'HBuilderProcessId', 'VITEST', 'VITEST_POOL_ID']) {
    expect(plan.env?.[key], key).toBeUndefined()
  }
  expect(inherited.UNI_INPUT_DIR).toBe('/wrong/project')
})

it.each(['about', 'node', 'uniapp-cli-vite'])('缺失或错误的 %s 安装身份立即失败', async (name) => {
  await save(path.join(plugins, name, 'package.json'), JSON.stringify({ name: 'wrong', version: '1' }))
  await expect(createWechatCompilerPlan(project, { cliPath: cli })).rejects.toThrow('组件身份无效')
})

it('两套候选安装同时存在时拒绝猜测', async () => {
  const alternative = pluginRootCandidates(cli)[1]!
  await save(path.join(alternative, 'about', 'package.json'), '{ "name": "about", "version": "5" }')
  await expect(createWechatCompilerPlan(project, { cliPath: cli })).rejects.toThrow('无法唯一确定')
})

it('编译入口缺失时保留旧产物，不能回退到 launcher', async () => {
  await rm(entry)
  const output = path.join(project, 'unpackage', 'dist', 'dev', 'mp-weixin', 'app.json')
  await save(output, 'previous')
  vi.stubEnv('HBUILDERX_COMPILE_ONLY', undefined)
  await expect(launchHBuilderXMiniProgram(project)).rejects.toMatchObject({ code: 'ENOENT' })
  expect(await readFile(output, 'utf8')).toBe('previous')
})

it.each([undefined, '0'])('真实子进程保持同一 PID 连续编译并按归属收尾（模式 %s）', async (mode) => {
  vi.stubEnv('HBUILDERX_COMPILE_ONLY', mode)
  const signals = process.listeners('SIGTERM')
  const result = launchHBuilderXMiniProgram(project)
  let failure: unknown
  const completion = result.catch((error) => {
    failure = error
  })
  const output = path.join(project, 'unpackage', 'dist', 'dev', 'mp-weixin')
  let pid: number | undefined
  try {
    await vi.waitFor(async () => {
      expect(failure).toBeUndefined()
      expect(await readFile(path.join(output, 'app.json'), 'utf8')).toBe('initial')
    }, { timeout: 5_000 })
    const initial = JSON.parse(await readFile(path.join(output, 'identity.json'), 'utf8'))
    pid = initial.pid
    expect(initial.args).toEqual(['-p', 'mp-weixin'])
    expect(initial.cwd).toBe(path.join(plugins, 'uniapp-cli-vite'))
    for (const marker of ['changed once', 'changed again']) {
      await save(path.join(project, 'source.txt'), marker)
      await vi.waitFor(async () => expect(await readFile(path.join(output, 'app.json'), 'utf8')).toBe(marker))
      expect(JSON.parse(await readFile(path.join(output, 'identity.json'), 'utf8')).pid).toBe(pid)
    }
  }
  finally {
    const ownedHandler = process.listeners('SIGTERM').find(handler => !signals.includes(handler))
    ownedHandler?.('SIGTERM')
    await completion
  }
  expect(failure).toBeUndefined()
  expect(process.listeners('SIGTERM')).toEqual(signals)
  expect(pid).toBeTypeOf('number')
  expect(() => process.kill(pid!, 0)).toThrow()
  await expect(access(path.join(project, '.debug'))).rejects.toMatchObject({ code: 'ENOENT' })
})

it.skipIf(process.platform === 'win32')('根编译器自行退出时清理仍存活的本轮 POSIX 后代组', async () => {
  vi.stubEnv('HBUILDERX_COMPILE_ONLY', undefined)
  await save(entry, `
const fs = require('node:fs')
const path = require('node:path')
const { spawn } = require('node:child_process')
const output = process.env.UNI_OUTPUT_DIR
fs.mkdirSync(output, { recursive: true })
const child = spawn(process.execPath, ['-e', 'setTimeout(() => process.exit(0), 3000)'], { stdio: 'ignore' })
fs.writeFileSync(path.join(output, 'descendant'), String(child.pid))
setTimeout(() => process.exit(1), 50)
`)
  await expect(launchHBuilderXMiniProgram(project)).rejects.toThrow('提前退出：1')
  const pid = Number(await readFile(path.join(project, 'unpackage', 'dist', 'dev', 'mp-weixin', 'descendant'), 'utf8'))
  expect(() => process.kill(pid, 0)).toThrow()
})
