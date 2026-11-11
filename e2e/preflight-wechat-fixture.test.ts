import type { MiniProgram } from '@weapp-vite/miniprogram-automator'
import type { ProbeContext } from '../scripts/e2e-preflight/types'
import { mkdir, mkdtemp, readdir, readFile, rm, stat, utimes, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { PNG } from 'pngjs'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { wechat } from '../scripts/e2e-preflight/probes/desktop'
import { Launcher } from '../scripts/wechat/automator'
import { existingWechatService, wechatRequest } from '../scripts/wechat/service'

vi.mock('../scripts/wechat/service', () => ({ assertWechatLogin: vi.fn(), existingWechatService: vi.fn(), wechatRequest: vi.fn() }))

let context: ProbeContext
let project: string
let connected: ReturnType<typeof vi.spyOn>

beforeEach(async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'wt-微信 fixture-'))
  context = { root: dir, dir, runId: 'fixture-run', url: 'http://127.0.0.1:1', phase: 'prepare' }
  project = path.join(dir, 'wechat-project')
  vi.stubEnv('E2E_PREFLIGHT_WECHAT_APPID', undefined)
  vi.stubEnv('E2E_TEMPLATE_IDE_APP_ID', undefined)
  vi.mocked(existingWechatService).mockResolvedValue({ command: 'fixture-cli', version: '2.02.2609231', metadata: 'fixture-metadata', httpPort: '12345' })
  let clicked = false
  vi.mocked(wechatRequest).mockImplementation(async (_port, operation) => {
    if (operation.kind === 'auto') {
      clicked = false
      return { autoPort: operation.port }
    }
    return { success: true }
  })
  const page = {
    $$: async () => [{ tap: async () => { clicked = true } }],
    data: async (key?: string) => key === 'marker' ? context.runId : { clicked },
  }
  connected = vi.spyOn(Launcher.prototype, 'connect').mockResolvedValue({
    currentPage: vi.fn().mockResolvedValue(page),
    screenshot: async ({ path: target }: { path: string }) => writeFile(target, PNG.sync.write(new PNG({ width: 20, height: 20 }))),
    disconnect: vi.fn(),
  } as unknown as MiniProgram)
})

afterEach(async () => {
  vi.resetAllMocks()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  await rm(context.dir, { recursive: true, force: true })
})

async function fixtureState() {
  const files = (await readdir(project, { recursive: true })).sort()
  return Promise.all(files.map(async (file) => {
    const target = path.join(project, file)
    const info = await stat(target)
    return { file, modified: info.mtimeMs, content: info.isFile() ? await readFile(target, 'utf8') : undefined }
  }))
}

it('verify 和 live 沿用 prepare 的同一完整项目，不制造文件保存事件', async () => {
  const prepared = await wechat(context)
  for (const file of await readdir(project, { recursive: true })) {
    await utimes(path.join(project, file), new Date(1000), new Date(1000))
  }
  const before = await fixtureState()
  const verified = await wechat({ ...context, phase: 'verify', binding: prepared.binding })
  expect(await fixtureState()).toEqual(before)
  expect(verified.binding).toEqual(prepared.binding)
  expect(JSON.stringify(verified.binding)).toBe(JSON.stringify(prepared.binding))
  const opened = vi.mocked(wechatRequest).mock.calls.length
  const live = await wechat({ ...context, phase: 'live', binding: verified.binding })
  expect(await fixtureState()).toEqual(before)
  expect(live.binding).toEqual(prepared.binding)
  expect(JSON.stringify(live.binding)).toBe(JSON.stringify(prepared.binding))
  expect(wechatRequest).toHaveBeenCalledTimes(opened)
  expect(connected).toHaveBeenCalledTimes(2)
})

it.each(['verify', 'live'] as const)('%s 拒绝被修改的探针源码，不覆盖文件或接触 IDE', async (phase) => {
  const prepared = await wechat(context)
  const source = 'App({onLaunch(){throw new Error("changed")}})'
  await writeFile(path.join(project, 'app.js'), source)
  vi.clearAllMocks()
  await expect(wechat({ ...context, phase, binding: prepared.binding })).rejects.toThrow('探针项目')
  expect(await readFile(path.join(project, 'app.js'), 'utf8')).toBe(source)
  expect(existingWechatService).not.toHaveBeenCalled()
  expect(wechatRequest).not.toHaveBeenCalled()
  expect(connected).not.toHaveBeenCalled()
})

it.each([
  'project.config.json',
  'app.json',
  'app.js',
  path.join('pages', 'probe', 'index.js'),
  path.join('pages', 'probe', 'index.json'),
  path.join('pages', 'probe', 'index.wxml'),
])('缺失必需文件 %s 时阻断，不自动重新生成', async (file) => {
  const prepared = await wechat(context)
  await rm(path.join(project, file))
  vi.clearAllMocks()
  await expect(wechat({ ...context, phase: 'verify', binding: prepared.binding })).rejects.toThrow('探针项目')
  await expect(stat(path.join(project, file))).rejects.toHaveProperty('code', 'ENOENT')
  expect(existingWechatService).not.toHaveBeenCalled()
  expect(wechatRequest).not.toHaveBeenCalled()
})

it('拒绝新增运行源码或文件类型变化，不把局部 fixture 当作完整项目', async () => {
  const prepared = await wechat(context)
  const extra = path.join(project, 'app.wxss')
  await writeFile(extra, 'view { display: none }')
  vi.clearAllMocks()
  await expect(wechat({ ...context, phase: 'live', binding: prepared.binding })).rejects.toThrow('未登记文件')
  await rm(extra)
  const source = path.join(project, 'app.js')
  await rm(source)
  await mkdir(source)
  await expect(wechat({ ...context, phase: 'verify', binding: prepared.binding })).rejects.toThrow('文件类型改变')
  expect(existingWechatService).not.toHaveBeenCalled()
  expect(wechatRequest).not.toHaveBeenCalled()
})

it('封存 IDE 首次补全的配置，允许编辑器元数据与私有配置正常落盘', async () => {
  const request = vi.mocked(wechatRequest).getMockImplementation()!
  vi.mocked(wechatRequest).mockImplementation(async (port, operation, timeout) => {
    if (operation.kind === 'close') {
      const file = path.join(project, 'project.config.json')
      const config = JSON.parse(await readFile(file, 'utf8'))
      config.setting.postcss = false
      config.editorSetting = { tabIndent: 'insertSpaces' }
      await writeFile(file, JSON.stringify(config, null, 2))
    }
    return request(port, operation, timeout)
  })
  const prepared = await wechat(context)
  expect(prepared.binding['fixtureSha256']).toMatch(/^[a-f0-9]{64}$/)
  vi.mocked(wechatRequest).mockImplementation(request)
  const file = path.join(project, 'project.config.json')
  const config = JSON.parse(await readFile(file, 'utf8'))
  config.editorSetting = { tabIndent: 'tab' }
  config.description = 'IDE 元数据'
  await writeFile(file, JSON.stringify(config))
  const privateFile = path.join(project, 'project.private.config.json')
  await writeFile(privateFile, JSON.stringify({ projectname: '本地项目名', setting: { useLanDebug: false } }))
  const before = await fixtureState()
  await expect(wechat({ ...context, phase: 'verify', binding: prepared.binding })).resolves.toHaveProperty('binding.fixtureSha256', prepared.binding['fixtureSha256'])
  expect(await fixtureState()).toEqual(before)
})

it.each(['appid', 'compileType', 'miniprogramRoot'])('私有配置不能改写已验证的 %s 身份', async (key) => {
  const prepared = await wechat(context)
  await writeFile(path.join(project, 'project.private.config.json'), JSON.stringify({ [key]: 'foreign' }))
  vi.clearAllMocks()
  await expect(wechat({ ...context, phase: 'live', binding: prepared.binding })).rejects.toThrow(`配置身份改变：${key}`)
  expect(existingWechatService).not.toHaveBeenCalled()
  expect(wechatRequest).not.toHaveBeenCalled()
})

it('已封存的编译配置发生变化时阻断', async () => {
  const prepared = await wechat(context)
  const file = path.join(project, 'project.config.json')
  const config = JSON.parse(await readFile(file, 'utf8'))
  config.setting.postcss = true
  await writeFile(file, JSON.stringify(config))
  vi.clearAllMocks()
  await expect(wechat({ ...context, phase: 'verify', binding: prepared.binding })).rejects.toThrow('封存内容不一致')
  expect(existingWechatService).not.toHaveBeenCalled()
  expect(wechatRequest).not.toHaveBeenCalled()
})

it('相对目录仍使用同一项目身份，其他 run 和缺少封存绑定则阻断', async () => {
  const prepared = await wechat(context)
  const relative = { ...context, dir: path.relative(process.cwd(), context.dir), phase: 'live' as const, binding: prepared.binding }
  await expect(wechat(relative)).resolves.toHaveProperty('binding.project', project)
  vi.clearAllMocks()
  await expect(wechat({ ...relative, runId: 'other-run' })).rejects.toThrow('配置身份改变')
  await expect(wechat({ ...relative, binding: { appid: prepared.binding['appid']! } })).rejects.toThrow('完整来源绑定')
  expect(existingWechatService).not.toHaveBeenCalled()
  expect(wechatRequest).not.toHaveBeenCalled()
})

it('重复 prepare 拒绝覆盖已存在项目，不制造额外自动化会话', async () => {
  await wechat(context)
  const before = await fixtureState()
  vi.clearAllMocks()
  await expect(wechat(context)).rejects.toThrow('不能覆盖已有文件')
  expect(await fixtureState()).toEqual(before)
  expect(wechatRequest).not.toHaveBeenCalled()
  expect(connected).not.toHaveBeenCalled()
})

it('清理完成后才封存，期间源码改变不能返回成功绑定', async () => {
  const request = vi.mocked(wechatRequest).getMockImplementation()!
  vi.mocked(wechatRequest).mockImplementation(async (port, operation, timeout) => {
    const result = await request(port, operation, timeout)
    if (operation.kind === 'close') {
      await writeFile(path.join(project, 'app.js'), 'App({changed:true})')
    }
    return result
  })
  await expect(wechat(context)).rejects.toThrow('源码改变：app.js')
  expect(vi.mocked(wechatRequest).mock.lastCall?.[1]).toMatchObject({ kind: 'close' })
})
