import type { ChildProcess } from 'node:child_process'

export type HBuilderXMiniProgramPlatform = 'mp-weixin' | 'mp-alipay' | 'mp-baidu' | 'mp-toutiao'
export type HBuilderXAppPlatform = 'app-android' | 'app-ios' | 'app-harmony'
export type HBuilderXPlatform = HBuilderXMiniProgramPlatform | HBuilderXAppPlatform
export type HBuilderXChannel = 'auto' | 'stable' | 'alpha'
export type HBuilderXResolvedChannel = Exclude<HBuilderXChannel, 'auto'> | 'unknown'

export type HBuilderXIssueKind
  = | 'cli-not-found'
    | 'cli-instance-mismatch'
    | 'cli-host-ambiguous'
    | 'project-not-uni-app'
    | 'project-type-unsupported'
    | 'config-load-failed'
    | 'android-toolchain-missing'
    | 'ios-toolchain-missing'
    | 'harmony-toolchain-missing'
    | 'harmony-build-failed'
    | 'timeout'
    | 'process-exit'
    | 'unknown'

export interface HBuilderXIssue {
  kind: HBuilderXIssueKind
  message: string
  hint?: string
}

export interface CommandExit {
  code: number | null
  signal: NodeJS.Signals | null
}

export interface HBuilderXCommandOptions {
  command: string
  args: string[]
  cwd: string
  /** 业务截止时间；超时后另有有界进程清理预算。 */
  timeoutMs?: number
  env?: Record<string, string | undefined>
  allowFailure?: boolean
  detached?: boolean
  stdio?: 'pipe' | 'inherit'
}

export interface HBuilderXCommandResult {
  command: string
  args: string[]
  cwd: string
  exit: CommandExit
  logs: string[]
  output: string
  issue: HBuilderXIssue
}

export interface SpawnedHBuilderXCommand {
  child: ChildProcess
  logs: string[]
  command: string
  args: string[]
  cwd: string
  /** 在 close 前启动有界清理并确认本轮进程树结束；失败抛出诊断，多次调用复用同一结果。 */
  stop: (signal?: NodeJS.Signals) => Promise<void>
  closed: Promise<CommandExit>
  ensureRunning: () => void
}

export interface HBuilderXProjectOptions {
  cwd: string
  hbuilderxCliPath?: string
  channel?: HBuilderXChannel
  host?: string
  env?: Record<string, string | undefined>
  timeoutMs?: number
  allowFailure?: boolean
}

export interface HBuilderXLaunchOptions extends HBuilderXProjectOptions {
  platform: HBuilderXPlatform
  args?: string[]
  compile?: boolean
  runtimeLog?: boolean
}

export interface ToolResult {
  ok: boolean
  output: string
  status: number | null
  signal: NodeJS.Signals | null
}

export interface AndroidToolchain {
  command: string
  output: string
  env: Record<string, string> | undefined
}

export type HBuilderXCliResolutionSource = 'running-process' | 'env' | 'default-path' | 'candidate'

export interface HBuilderXCliResolveOptions {
  candidates?: string[]
  channel?: HBuilderXChannel
  env?: NodeJS.ProcessEnv
  host?: string
}

export interface HBuilderXCliResolution {
  path: string
  isRunning: boolean
  source: HBuilderXCliResolutionSource
  channel: HBuilderXResolvedChannel
  host?: string
  version?: string
}

export interface HBuilderXNativeCommandOptions {
  args: string[]
  cwd?: string
  timeoutMs?: number
  env?: Record<string, string | undefined>
  allowFailure?: boolean
  detached?: boolean
  stdio?: 'pipe' | 'inherit'
}

export interface HBuilderXRunnerOptions extends HBuilderXCliResolveOptions {
  cwd?: string
  hbuilderxCliPath?: string
  timeoutMs?: number
}

export interface HBuilderXRunner {
  resolution: HBuilderXCliResolution
  run: (options: HBuilderXNativeCommandOptions) => Promise<HBuilderXCommandResult>
  spawn: (options: HBuilderXNativeCommandOptions) => SpawnedHBuilderXCommand
  closeProject: (options: HBuilderXProjectOptions) => Promise<HBuilderXCommandResult>
  openProject: (options: HBuilderXProjectOptions) => Promise<HBuilderXCommandResult>
  prepareProject: (options: HBuilderXProjectOptions) => Promise<HBuilderXCommandResult>
  launchProject: (options: HBuilderXLaunchOptions) => Promise<HBuilderXCommandResult>
  startLaunch: (options: HBuilderXLaunchOptions) => SpawnedHBuilderXCommand
}
