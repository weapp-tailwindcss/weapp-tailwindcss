import type { MiniProgram } from '@weapp-vite/miniprogram-automator'
import type { ProbeContext, ProbeOutput } from '../types'
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { satisfies } from 'semver'
import { parseHBuilderXVersion } from '../../../packages/hbuilderx-runner/src/hbuilderx/hosts'
import { createHBuilderXRunner } from '../../../packages/hbuilderx-runner/src/hbuilderx/runner'
import { assertWechatAppIdBinding, resolveWechatAppId } from '../../wechat-app-id'
import { closeWechatProject } from '../../wechat-project-cleanup'
import { assertWechatLogin, existingWechatService, wechatRequest } from '../../wechat/service'
import { assertImage, command } from '../io'
import { hbuilderxTools } from './hbuilderx-tools'
import { availablePort } from './port'
import { waitForProbe } from './wait'
import { connectWechat } from './wechat-connect'

export async function base(ctx: ProbeContext): Promise<ProbeOutput> {
  const manifest = JSON.parse(await readFile(path.join(ctx.root, 'package.json'), 'utf8'))
  const pnpm = await command('pnpm', ['--version'])
  if (!satisfies(process.versions.node, manifest.engines.node) || `pnpm@${pnpm}` !== manifest.packageManager) {
    throw new Error(`需要 Node ${manifest.engines.node} / ${manifest.packageManager}，实际 ${process.version} / pnpm@${pnpm}`)
  }
  for (const name of ['tsx', 'vitest', 'playwright', '@weapp-vite/miniprogram-automator']) {
    await access(fileURLToPath(import.meta.resolve(name)))
  }
  const temp = await mkdtemp(path.join(os.tmpdir(), 'wt-preflight-'))
  try {
    await writeFile(path.join(temp, 'probe'), ctx.runId)
    if (await readFile(path.join(temp, 'probe'), 'utf8') !== ctx.runId) {
      throw new Error('临时目录读写不一致。')
    }
    const response = await fetch(ctx.url, { signal: AbortSignal.timeout(5000) })
    if (!response.ok || !(await response.text()).includes(ctx.runId)) {
      throw new Error('本轮探针服务身份或端口不可用。')
    }
  }
  finally {
    await rm(temp, { recursive: true, force: true })
  }
  return { detail: 'Node/pnpm、依赖解析、临时目录和本轮服务端口通过。', binding: { node: process.version, pnpm } }
}

export async function hbuilderx(ctx: ProbeContext): Promise<ProbeOutput> {
  if (ctx.binding) {
    const { command: cli, host, version } = ctx.binding
    const actual = await command(cli!, ['version', '--host', host!])
    if (parseHBuilderXVersion(actual) !== version) {
      throw new Error(`HBuilderX 实例版本改变：${actual}`)
    }
    await command(cli!, ['project', 'list', '--host', host!])
    return { detail: 'HBuilderX 原 host 的版本、项目查询和平台组件入口通过。', binding: { ...ctx.binding, ...await hbuilderxTools(cli!) } }
  }
  const runner = await createHBuilderXRunner({ cwd: ctx.root, timeoutMs: 30_000 })
  await runner.run({ args: ['project', 'list'], timeoutMs: 10_000 })
  const { path: cli, host, version, channel } = runner.resolution
  if (!host || !version) {
    throw new Error('未能确定 HBuilderX host 与实际版本。')
  }
  return { detail: 'HBuilderX CLI/host/channel、项目查询及平台组件入口通过。', binding: { command: cli, host, version, channel, ...await hbuilderxTools(cli) } }
}

export async function wechat(ctx: ProbeContext): Promise<ProbeOutput> {
  const appid = ctx.phase === 'prepare' ? resolveWechatAppId() : assertWechatAppIdBinding(ctx.binding?.['appid'])
  const binding = { ...await existingWechatService(ctx.binding?.command), appid }
  if (ctx.binding?.httpPort && ctx.binding.httpPort !== binding.httpPort) {
    throw new Error('微信 IDE HTTP 服务端口已改变；必须重新 prepare。')
  }
  await assertWechatLogin(binding.httpPort)
  if (ctx.phase === 'live') {
    return { detail: '微信 IDE 已有 HTTP 服务与登录状态可用；未启动 CLI。', binding }
  }
  const project = path.join(ctx.dir, 'wechat-project')
  await mkdir(path.join(project, 'pages', 'probe'), { recursive: true })
  const files: Record<string, string> = {
    'project.config.json': JSON.stringify({ appid, projectname: `preflight-${ctx.runId}`, compileType: 'miniprogram', miniprogramRoot: './', setting: { es6: true } }),
    'app.json': JSON.stringify({ pages: ['pages/probe/index'], window: { navigationBarTitleText: '环境预检' } }),
    'app.js': 'App({})',
    [path.join('pages', 'probe', 'index.js')]: `Page({data:{marker:${JSON.stringify(ctx.runId)},clicked:false},tap(){this.setData({clicked:true})}})`,
    [path.join('pages', 'probe', 'index.json')]: '{}',
    [path.join('pages', 'probe', 'index.wxml')]: '<view id="marker">{{marker}}</view><button id="probe" bindtap="tap">验证</button><view id="result">{{clicked}}</view>',
  }
  for (const [name, content] of Object.entries(files)) {
    await writeFile(path.join(project, name), content)
  }
  const port = await availablePort()
  let mini: MiniProgram | undefined
  let failed = false
  const screenshot = path.join(ctx.dir, 'wechat.png')
  try {
    // 仅请求已开启的 IDE 服务，避免 CLI 隐式启动触发登录票据刷新。
    process.stdout.write(`[preflight] 打开本轮微信探针 ${project}，自动化端口 ${port}\n`)
    const opened = await wechatRequest(binding.httpPort, { kind: 'auto', project, port }, 30_000)
    if (opened.autoPort !== port) {
      throw new Error('微信 IDE 自动化端口与本轮请求不一致。')
    }
    await assertWechatLogin(binding.httpPort)
    const connection = await connectWechat(port)
    mini = connection
    let page: Awaited<ReturnType<MiniProgram['currentPage']>>
    await waitForProbe(async () => {
      let actual: string | undefined
      try {
        // HTTP auto 返回时页面可能仍在创建，页面元数据与本轮标识一起等待，不提前读取一次。
        page = await connection.currentPage()
        actual = page ? await (await page.$('#marker'))?.text() : undefined
      }
      catch (error) {
        return { expected: ctx.runId, actual, error: String(error) }
      }
      if (actual && actual !== ctx.runId) {
        throw new Error(`微信运行页面并非本轮探针：expected=${ctx.runId} actual=${actual}`)
      }
      return { expected: ctx.runId, actual }
    }, value => value.actual === ctx.runId)
    const button = await page!.$('#probe')
    if (!button) {
      throw new Error('微信本轮探针缺少交互按钮。')
    }
    await button.tap()
    await waitForProbe(async () => ({ data: await page!.data(), text: await (await page!.$('#result'))?.text() }), value => value.data?.clicked === true && value.text === 'true')
    await mini.screenshot({ path: screenshot })
    await assertImage(screenshot)
    return { detail: '微信登录、真实 DevTools 自动化连接、页面交互和截图通过。', binding, evidence: [screenshot] }
  }
  catch (error) {
    failed = true
    const captured = mini && await mini.screenshot({ path: screenshot }).then(() => true, () => false)
    throw new Error(`${String(error)}；微信现场截图：${captured ? screenshot : '连接不可用，未取得'}`)
  }
  finally {
    // 仅释放本次连接，不关闭 IDE 或其他项目，也不使用全局进程清理。
    await closeWechatProject(project, mini, 10_000, binding.httpPort).catch((error) => {
      if (!failed) {
        throw error
      }
      process.stderr.write(`[preflight] 本轮微信探针清理失败：${String(error)}\n`)
    })
  }
}
