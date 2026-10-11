import type { ProbeId } from './types'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { assertWechatAppIdBinding } from '../wechat-app-id'
import { formatWorkflowError } from './cleanup'
import { readReport, request } from './client'
import { collectIdentity } from './io'
import { iosSimulatorDestination } from './targets'

export function stageChecks(name: string, extended = false): ProbeId[] {
  if (/visual-weapp-h5-app/i.test(name)) {
    return ['wechat', 'hbuilderx', 'ios', 'android', 'harmony', 'web']
  }
  const ids: ProbeId[] = []
  for (const id of ['ios', 'android', 'harmony'] as const) {
    if (name.toLowerCase().includes(id)) {
      ids.push(id)
    }
  }
  if (/hbuilderx/i.test(name)) {
    ids.push('hbuilderx')
  }
  if (/wechat|mini-program|\bmp\b|weapp/i.test(name)) {
    ids.push('wechat')
  }
  if (/h5|web|browser/i.test(name)) {
    ids.push('web')
  }
  if (extended && /React Native|Lynx/i.test(name)) {
    if (ids.includes('android')) {
      ids.push('runtime-android')
    }
    if (ids.includes('ios')) {
      ids.push('runtime-ios')
    }
  }
  return [...new Set(ids)]
}

export function bindingEnvironment(bindings: Record<string, Record<string, string>>, env: NodeJS.ProcessEnv = process.env) {
  const android = bindings.android?.device
  const ios = bindings.ios?.device
  const harmony = bindings.harmony?.device
  const hx = bindings.hbuilderx
  if (!android || !ios || !harmony || !hx?.command || !hx.host || !hx.channel || !bindings.wechat?.httpPort) {
    throw new Error('预检缺少目标绑定。')
  }
  const appid = assertWechatAppIdBinding(bindings['wechat']?.['appid'], env)
  return {
    E2E_PREFLIGHT_WECHAT_CLI: bindings.wechat!.command!,
    E2E_PREFLIGHT_WECHAT_HTTP_PORT: bindings.wechat!.httpPort!,
    E2E_PREFLIGHT_WECHAT_APPID: appid,
    E2E_TEMPLATE_IDE_APP_ID: appid,
    E2E_HBUILDERX_CHROME_PATH: bindings.web!.hbuilderxBrowser ?? bindings.web!.command!,
    WEAPP_VITE_E2E_RUNTIME_PROVIDER: 'devtools',
    E2E_SKIP_OPEN_AUTOMATOR: '0',
    E2E_SKIP_BUILD: '0',
    DEMO_VISUAL_IDE_CLEANUP: '0',
    HBUILDERX_CLI_PATH: hx.command,
    HBUILDERX_HOST: hx.host,
    HBUILDERX_CHANNEL: hx.channel,
    E2E_HBUILDERX_ANDROID_DEVICE_ID: android,
    E2E_HBUILDERX_ANDROID_SCREENSHOT_DEVICE_ID: android,
    E2E_HBUILDERX_IOS_DEVICE_ID: ios,
    E2E_HBUILDERX_IOS_SCREENSHOT_TARGET: ios,
    E2E_HBUILDERX_HARMONY_DEVICE_ID: harmony,
    DEMO_VISUAL_HARMONY_DEVICE_ID: harmony,
    DEMO_VISUAL_HARMONY_SCREENSHOT_DEVICE_ID: harmony,
    HDC_PATH: bindings.harmony!.command!,
    E2E_HBUILDERX_HARMONY_HDC_PATH: bindings.harmony!.command!,
    DEMO_VISUAL_HARMONY_HDC_PATH: bindings.harmony!.command!,
    PATH: path.isAbsolute(bindings.android!.command!) ? `${path.dirname(bindings.android!.command!)}${path.delimiter}${process.env.PATH ?? ''}` : process.env.PATH ?? '',
    RN_ANDROID_DEVICE_ID: android,
    RN_IOS_DEVICE_ID: ios,
    LYNX_ANDROID_DEVICE_ID: android,
    ANDROID_SERIAL: android,
    LYNX_IOS_DEVICE_ID: ios,
    LYNX_IOS_DESTINATION: iosSimulatorDestination(ios, env['LYNX_IOS_DESTINATION']),
  }
}

async function recordBlock(root: string, error: unknown, stage?: string) {
  const dir = path.join(root, 'e2e', '.artifacts', 'preflight', `blocked-${Date.now()}-${process.pid}`)
  const reason = formatWorkflowError(error)
  const stopped = stage ? `未启动阶段 ${stage}，停止后续调度。` : '未启动测试子进程。'
  try {
    await mkdir(dir, { recursive: true })
    await writeFile(path.join(dir, 'report.json'), JSON.stringify({ status: 'blocked', reason, testsStarted: Boolean(stage), stage }, null, 2))
    await writeFile(path.join(dir, 'report.md'), `# 全面测试已阻断\n\n${reason}\n\n${stopped}请重新执行 prepare、当前会话 computer use 和 verify。\n`)
  }
  catch (reportError) {
    throw new AggregateError([error, reportError], `全面测试已阻断；${stopped}阻断报告写入失败：${dir}`, { cause: error })
  }
  return dir
}

export async function enterFullTestGate(file?: string, root = process.cwd(), extended = false) {
  try {
    if (!file) {
      throw new Error('缺少 --preflight-report；先执行 pnpm e2e:preflight prepare 和 verify。')
    }
    const report = await readReport(file)
    const identity = await collectIdentity(root)
    const claimed = await request<{ lease: string, bindings: Record<string, Record<string, string>> }>(report, 'claim', { identity, consumer: `${process.pid}:${root}`, extended })
    let env: ReturnType<typeof bindingEnvironment>
    try {
      env = bindingEnvironment(claimed.bindings)
    }
    catch (error) {
      // 已领取后若绑定校验失败，仍须归还本轮租约，避免留下无法执行的活动门禁。
      try {
        await request(report, 'finish', { lease: claimed.lease })
      }
      catch (cleanupError) {
        throw new AggregateError([error, cleanupError], '预检绑定校验与租约归还同时失败。', { cause: error })
      }
      throw error
    }
    return {
      env,
      async check(stage: string) {
        try {
          await request(report, 'check', { identity: await collectIdentity(root), lease: claimed.lease, ids: stageChecks(stage, extended) })
        }
        catch (error) {
          const dir = await recordBlock(root, error, stage)
          throw new Error(`全面测试已阻断，停止后续调度：${String(error)}；报告：${dir}；预检：${file}`, { cause: error })
        }
      },
      async close() {
        await request(report, 'finish', { lease: claimed.lease })
      },
    }
  }
  catch (error) {
    const dir = await recordBlock(root, error)
    throw new Error(`全面测试已阻断；未启动测试子进程。${String(error)}\n报告：${dir}`, { cause: error })
  }
}
