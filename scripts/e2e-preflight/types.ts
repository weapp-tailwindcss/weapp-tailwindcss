export const checkIds = ['base', 'wechat', 'hbuilderx', 'ios', 'android', 'harmony', 'web', 'computer-use'] as const
export const runtimeCheckIds = ['runtime-android', 'runtime-ios'] as const
export type CheckId = typeof checkIds[number] | typeof runtimeCheckIds[number]

export function requiredCheckIds(extended = false): CheckId[] {
  return extended ? [...checkIds, ...runtimeCheckIds] : [...checkIds]
}
export type ProbeId = Exclude<CheckId, 'computer-use'>
export const maxAgeMs = 15 * 60_000

export interface Identity {
  root: string
  head: string
  source: string
  host: string
  platform: string
  config: Record<string, string>
}

export interface Check {
  id: CheckId
  status: 'passed' | 'blocked' | 'not-run'
  checkedAt: string
  detail: string
  remedy: string
  evidence: string[]
  binding?: Record<string, string>
}

export interface PreflightReport {
  schema: 'full-test-preflight/v1'
  extended?: boolean
  runId: string
  identity: Identity
  createdAt: string
  verifiedAt?: string
  status: 'blocked' | 'ready' | 'running' | 'finished'
  checks: Check[]
  endpoint: string
  token: string
  challenge: string
  consumer?: string
  interruption?: string
}

export interface ProbeContext {
  root: string
  dir: string
  runId: string
  url: string
  phase: 'prepare' | 'verify' | 'live'
  binding?: Record<string, string>
}

export interface ProbeOutput {
  detail: string
  evidence?: string[]
  binding?: Record<string, string>
}

export const remedies: Record<CheckId, string> = {
  'runtime-android': '配置 RN_JAVA_HOME、LYNX_JAVA_HOME、LYNX_GRADLE 和唯一 Android SDK；工具链需满足各原生工程要求。',
  'runtime-ios': '准备 PATH 中的 CocoaPods、xcodegen，以及 LYNX_POD 指定的 CocoaPods；不自动安装。',
  'base': '按根 manifest 准备 Node、pnpm 和依赖，检查 checkout、临时目录及端口。',
  'wechat': '手动打开微信 IDE 并确认登录和服务端口；指定 E2E_PREFLIGHT_WECHAT_CLI 仅识别安装，必要时指定 E2E_PREFLIGHT_WECHAT_HTTP_PORT，不自动启动或重置登录。',
  'hbuilderx': '检查 HBUILDERX_CLI_PATH、HBUILDERX_CHANNEL、HBUILDERX_HOST，解决实例冲突。',
  'ios': '安装完整 Xcode 并完成首次启动；指定 E2E_HBUILDERX_IOS_DEVICE_ID。',
  'android': '通过已安装的 Android Studio 启动明确的 AVD，完成授权，指定 E2E_HBUILDERX_ANDROID_DEVICE_ID。',
  'harmony': '通过已安装的 DevEco 启动明确的模拟器，指定 HDC_PATH 和 E2E_HBUILDERX_HARMONY_DEVICE_ID。',
  'web': '修复 Playwright Chromium 安装及启动错误，确认本地探针页面可交互和截图。',
  'computer-use': '在当前 AI 会话完成发现、界面读取、截图、输入和点击，保存工具证据；工具缺失或认证失败需用户恢复。',
}
