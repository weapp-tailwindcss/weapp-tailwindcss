import type { Buffer } from 'node:buffer'
import type { Identity, PreflightReport } from './types'
import { createHash } from 'node:crypto'
import { readFile, realpath, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { execa } from 'execa'

const { PNG } = createRequire(import.meta.url)('pngjs') as { PNG: { sync: { read: (buffer: Buffer) => { width: number, height: number } } } }

export async function command(file: string, args: string[], timeout = 15_000) {
  const result = await execa(file, args, { timeout, forceKillAfterDelay: 1000, windowsHide: true })
  return result.stdout.trim()
}

export async function imageCommand(file: string, args: string[], target: string) {
  const result = await execa(file, args, { timeout: 15_000, forceKillAfterDelay: 1000, encoding: 'buffer', windowsHide: true })
  await writeFile(target, result.stdout)
  await assertImage(target)
}

export async function assertImage(file: string) {
  const buffer = await readFile(file)
  const metadata = PNG.sync.read(buffer)
  if (metadata.width < 10 || metadata.height < 10) {
    throw new Error(`截图尺寸无效：${file}`)
  }
}

const configKeys = [
  'HBUILDERX_CLI_PATH',
  'HBUILDERX_CHANNEL',
  'HBUILDERX_HOST',
  'DEVELOPER_DIR',
  'PATH',
  'Path',
  'PATHEXT',
  'JAVA_HOME',
  'RN_JAVA_HOME',
  'LYNX_JAVA_HOME',
  'LYNX_GRADLE',
  'LYNX_POD',
  'ANDROID_HOME',
  'ANDROID_SDK_ROOT',
  'HDC_PATH',
  'E2E_PREFLIGHT_WECHAT_CLI',
  'E2E_PREFLIGHT_WECHAT_HTTP_PORT',
  'E2E_PREFLIGHT_WECHAT_APPID',
  'E2E_TEMPLATE_IDE_APP_ID',
  'E2E_HBUILDERX_CHROME_PATH',
  'E2E_HBUILDERX_ANDROID_DEVICE_ID',
  'E2E_HBUILDERX_ANDROID_SCREENSHOT_DEVICE_ID',
  'E2E_HBUILDERX_IOS_DEVICE_ID',
  'E2E_HBUILDERX_IOS_TARGET',
  'E2E_HBUILDERX_IOS_SCREENSHOT_TARGET',
  'E2E_HBUILDERX_HARMONY_DEVICE_ID',
  'E2E_HBUILDERX_HARMONY_HDC_PATH',
  'DEMO_VISUAL_HARMONY_HDC_PATH',
  'DEMO_VISUAL_HARMONY_DEVICE_ID',
  'DEMO_VISUAL_HARMONY_SCREENSHOT_DEVICE_ID',
  'DEMO_VISUAL_ANDROID_DEVICE_ID',
  'DEMO_VISUAL_IOS_DEVICE_ID',
  'RN_ANDROID_DEVICE_ID',
  'RN_ANDROID_EXPO_DEVICE',
  'RN_IOS_DEVICE_ID',
  'LYNX_ANDROID_DEVICE_ID',
  'ANDROID_SERIAL',
  'LYNX_IOS_DEVICE_ID',
  'LYNX_IOS_DESTINATION',
]

export async function collectIdentity(root: string): Promise<Identity> {
  root = await realpath(root)
  const git = (...args: string[]) => execa('git', args, { cwd: root, timeout: 15_000 }).then(result => result.stdout)
  const hash = createHash('sha256').update(await git('diff', 'HEAD', '--binary'))
  const untracked = (await git('ls-files', '--others', '--exclude-standard', '-z')).split('\0').filter(Boolean).sort()
  for (const file of untracked) {
    hash.update(file).update(await readFile(path.resolve(root, file)))
  }
  return {
    root,
    head: (await git('rev-parse', 'HEAD')).trim(),
    source: hash.digest('hex'),
    host: os.hostname(),
    platform: process.platform,
    config: Object.fromEntries(configKeys.map(key => [key, process.env[key] ?? ''])),
  }
}

export function samePath(a: string, b: string, platform = process.platform) {
  const api = platform === 'win32' ? path.win32 : path.posix
  return api.isAbsolute(a) && api.isAbsolute(b) && api.normalize(a) === api.normalize(b)
}

export function assertIdentity(expected: Identity, actual: Identity) {
  const changed = [
    ...(!samePath(expected.root, actual.root, actual.platform as NodeJS.Platform) ? ['root'] : []),
    ...(['head', 'source', 'host', 'platform'] as const).filter(key => expected[key] !== actual[key]),
    ...(JSON.stringify(expected.config) !== JSON.stringify(actual.config) ? ['config'] : []),
  ]
  if (changed.length) {
    throw new Error(`预检 checkout、源码、主机或工具/设备配置已变化；必须重新 prepare。变化字段：${changed.join(', ')}。`)
  }
}

export async function writeReport(file: string, report: PreflightReport) {
  await writeFile(file, `${JSON.stringify(report, null, 2)}\n`)
  const lines = [
    '# 全面测试环境预检',
    '',
    `- 状态：${report.status}`,
    `- run ID：${report.runId}`,
    `- checkout：${report.identity.root}`,
    `- SHA：${report.identity.head}`,
    `- 主机：${report.identity.host} (${report.identity.platform})`,
    `- 创建时间：${report.createdAt}`,
    `- 验证时间：${report.verifiedAt ?? '未验证'}`,
    '',
    report.status === 'blocked' ? `**全面测试已阻断；${report.consumer ? '停止后续阶段调度' : '未启动测试子进程'}。恢复后重新验证。**` : '预检就绪不代表业务测试通过。',
    report.interruption ?? '',
    '',
  ]
  for (const check of report.checks) {
    lines.push(`## ${check.id}：${check.status}`, '', check.detail, '', `检查时间：${check.checkedAt || '未执行'}`, '', `恢复建议：${check.remedy}`, '', `目标/版本：${JSON.stringify(check.binding ?? {})}`, '', ...check.evidence.map(item => `- 证据：${item}`), '')
  }
  await writeFile(path.join(path.dirname(file), 'report.md'), `${lines.join('\n')}\n`)
}
