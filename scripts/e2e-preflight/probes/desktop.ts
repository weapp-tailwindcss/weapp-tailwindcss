import type { MiniProgram } from '@weapp-vite/miniprogram-automator'
import type { ProbeContext, ProbeOutput } from '../types'
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { satisfies } from 'semver'
import { parseHBuilderXVersion } from '../../../packages/hbuilderx-runner/src/hbuilderx/hosts'
import { createHBuilderXRunner } from '../../../packages/hbuilderx-runner/src/hbuilderx/runner'
import { assertNativeSessionsAvailable } from '../../hbuilderx-native-registry'
import { createPnpmCommand } from '../../pnpm-command.mjs'
import { assertWechatAppIdBinding, resolveWechatAppId } from '../../wechat-app-id'
import { closeWechatProject } from '../../wechat-project-cleanup'
import { assertWechatLogin, existingWechatService, wechatRequest } from '../../wechat/service'
import { runWithCleanup } from '../cleanup'
import { assertImage, command } from '../io'
import { hbuilderxTools } from './hbuilderx-tools'
import { availablePort } from './port'
import { rustToolchain } from './rust'
import { waitForProbe } from './wait'
import { connectWechat } from './wechat-connect'
import { isWechatProtocolUnavailable, waitForWechatPage, waitForWechatProbeButton } from './wechat-page'
import { assertWechatProbeProject, createWechatProbeProject, inspectWechatProbeProject } from './wechat-project'

export async function base(ctx: ProbeContext): Promise<ProbeOutput> {
  const manifest = JSON.parse(await readFile(path.join(ctx.root, 'package.json'), 'utf8'))
  const invocation = createPnpmCommand(['--version'])
  const pnpm = await command(invocation.command, invocation.args, 15_000, invocation.shell)
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
  const rust = ctx.extended ? await rustToolchain(ctx) : {}
  return { detail: `Node/pnpm、依赖解析、临时目录和本轮服务端口通过。${ctx.extended ? '当前宿主 Rust/cargo/Clippy 与 target 标准库已核对，尚未编译。' : ''}`, binding: { node: process.version, pnpm, ...rust } }
}

export async function hbuilderx(ctx: ProbeContext): Promise<ProbeOutput> {
  if (ctx.binding) {
    const { command: cli, host, version } = ctx.binding
    const actual = await command(cli!, ['version', '--host', host!])
    if (parseHBuilderXVersion(actual) !== version) {
      throw new Error(`HBuilderX 实例版本改变：${actual}`)
    }
    await assertNativeSessionsAvailable(ctx.root, { path: cli!, host: host! })
    await command(cli!, ['project', 'list', '--host', host!])
    return { detail: 'HBuilderX 原 host 的版本、项目查询和平台组件入口通过。', binding: { ...ctx.binding, ...await hbuilderxTools(cli!) } }
  }
  const runner = await createHBuilderXRunner({ cwd: ctx.root, timeoutMs: 30_000 })
  const { path: cli, host, version, channel } = runner.resolution
  if (!host || !version) {
    throw new Error('未能确定 HBuilderX host 与实际版本。')
  }
  await assertNativeSessionsAvailable(ctx.root, { path: cli, host })
  await runner.run({ args: ['project', 'list'], timeoutMs: 10_000 })
  return { detail: 'HBuilderX CLI/host/channel、项目查询及平台组件入口通过。', binding: { command: cli, host, version, channel, ...await hbuilderxTools(cli) } }
}

export async function wechat(ctx: ProbeContext): Promise<ProbeOutput & { binding: Record<string, string> }> {
  const appid = ctx.phase === 'prepare' ? resolveWechatAppId() : assertWechatAppIdBinding(ctx.binding?.['appid'])
  const fixture = ctx.phase === 'prepare' ? undefined : await assertWechatProbeProject(ctx, appid)
  const binding = { ...await existingWechatService(ctx.binding?.['command']), appid, ...fixture }
  if (ctx.binding?.['httpPort'] && ctx.binding['httpPort'] !== binding.httpPort) {
    throw new Error('微信 IDE HTTP 服务端口已改变；必须重新 prepare。')
  }
  await assertWechatLogin(binding.httpPort)
  process.stdout.write(`[preflight] 微信 IDE 127.0.0.1:${binding.httpPort} 登录查询通过；此项不代表项目操作或运行时已通过。\n`)
  if (ctx.phase === 'live') {
    return { detail: '微信探针项目来源、已有 HTTP 服务与登录状态可用；未启动 CLI。', binding }
  }
  if (ctx.phase === 'prepare') {
    await createWechatProbeProject(ctx, appid)
  }
  const project = path.resolve(ctx.dir, 'wechat-project')
  const port = await availablePort()
  let mini: MiniProgram | undefined
  let openedByProbe = false
  const screenshot = path.join(ctx.dir, 'wechat.png')
  const output = await runWithCleanup(async () => {
    try {
      // 仅请求已开启的 IDE 服务，避免 CLI 隐式启动触发登录票据刷新。
      process.stdout.write(`[preflight] 打开本轮微信探针 ${project}，自动化端口 ${port}\n`)
      const opened = await wechatRequest(binding.httpPort, { kind: 'auto', project, port }, 30_000)
      openedByProbe = true
      if (opened['autoPort'] !== port) {
        throw new Error('微信 IDE 自动化端口与本轮请求不一致。')
      }
      await assertWechatLogin(binding.httpPort)
      const connection = await connectWechat(port)
      mini = connection
      // 稳定版 IDE 会在自动化端口可连接后继续编译并注册 pageframe 元数据。
      await connection.waitForAppReady?.(60_000)
      const page = await waitForWechatPage(connection, ctx.runId, 15_000)
      const button = await waitForWechatProbeButton(page, ctx.runId)
      await button.tap()
      await waitForProbe(async () => {
        const data = await page.data(undefined, { timeout: 5_000, fallback: false })
        return { clicked: data && typeof data === 'object' ? data.clicked : data }
      }, value => value.clicked === true)
      await mini.screenshot({ path: screenshot, timeout: 5_000 })
      await assertImage(screenshot)
      return { detail: '微信登录、真实 DevTools 自动化连接、页面交互和截图通过。', binding, evidence: [screenshot] }
    }
    catch (error) {
      const screenshotStatus = mini
        ? isWechatProtocolUnavailable(error) ? '自动化协议已超时，未继续请求失败截图' : `微信现场截图目标：${screenshot}`
        : '连接不可用，未取得微信现场截图'
      return runWithCleanup(async () => {
        throw new Error(`${error instanceof Error ? error.message : String(error)}；${screenshotStatus}`, { cause: error })
      }, async () => {
        if (mini && !isWechatProtocolUnavailable(error)) {
          await mini.screenshot({ path: screenshot, timeout: 5_000 })
        }
      })
    }
  }, async () => {
    // 直接 auto 成功返回后才持有项目；拒绝或冲突不能关闭已有会话。
    if (openedByProbe) {
      await closeWechatProject(project, mini, 10_000, binding.httpPort)
    }
  })
  // IDE 可以在首次运行时补写默认配置；只有探针和项目清理均成功才封存。
  const verifiedFixture = ctx.phase === 'prepare'
    ? await inspectWechatProbeProject(ctx, appid)
    : await assertWechatProbeProject(ctx, appid)
  return { ...output, binding: { ...binding, ...verifiedFixture } }
}
