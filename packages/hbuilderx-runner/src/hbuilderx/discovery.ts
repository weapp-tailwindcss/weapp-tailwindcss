import type { SpawnSyncReturns } from 'node:child_process'
import type {
  HBuilderXChannel,
  HBuilderXCliResolution,
  HBuilderXCliResolveOptions,
  HBuilderXResolvedChannel,
} from '../types'
import { Buffer } from 'node:buffer'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'
import { fileExists } from '../fs'

import { macOSAlphaCli, macOSStableCli, resolveConfiguredCli } from './configured-cli'

export { macOSAlphaCli, macOSStableCli } from './configured-cli'

function unique(items: string[]) {
  return [...new Set(items)]
}

function normalizeFile(file: string, platform: NodeJS.Platform = process.platform) {
  const normalized = path.normalize(file)
  return platform === 'win32' ? normalized.toLowerCase() : normalized
}

export function resolveHBuilderXChannel(channel?: string): HBuilderXChannel {
  const value = channel ?? 'auto'
  if (value === 'auto' || value === 'stable' || value === 'alpha') {
    return value
  }
  throw new Error(`无效的 HBuilderX channel：${value}。可选值为 auto、stable、alpha。`)
}

export function inferHBuilderXChannel(file: string): HBuilderXResolvedChannel {
  if (/HBuilderX(?:-|\s*)Alpha(?:\.app)?[\\/]/i.test(file) || /(?:^|[\\/])alpha(?:[\\/]|$)/i.test(file)) {
    return 'alpha'
  }
  if (/HBuilderX(?:\.app)?[\\/]/i.test(file) || /HBuilderX\.exe$/i.test(file)) {
    return 'stable'
  }
  return 'unknown'
}

export function getDefaultHBuilderXCliCandidates(
  env: NodeJS.ProcessEnv = process.env,
  channel: HBuilderXChannel = resolveHBuilderXChannel(env['HBUILDERX_CHANNEL']),
  platform: NodeJS.Platform = process.platform,
) {
  const defaults = platform === 'darwin'
    ? channel === 'stable'
      ? [macOSStableCli]
      : channel === 'alpha'
        ? [macOSAlphaCli]
        : [macOSStableCli, macOSAlphaCli]
    : []
  return unique([
    env['HBUILDERX_CLI_PATH'],
    ...defaults,
  ].filter((item): item is string => Boolean(item)))
}

export function extractHBuilderXMacOSExecutables(output: string) {
  return unique(Array.from(
    output.matchAll(/(\/[^\r\n]*?HBuilderX(?:-Alpha|\s+Alpha)?\.app\/Contents\/MacOS\/HBuilderX)(?=\s|$)/gi),
    match => match[1]!,
  ))
}

export function extractHBuilderXWindowsExecutables(output: string) {
  const executables: string[] = []
  for (const line of output.split(/\r?\n/)) {
    const executable = line.split(',').at(-1)?.trim()
    if (executable?.toLowerCase().endsWith('hbuilderx.exe')) {
      executables.push(executable)
    }
  }
  return unique(executables)
}

export function extractHBuilderXExecutablesFromProcessOutput(output: string, platform: NodeJS.Platform = process.platform) {
  return platform === 'win32'
    ? extractHBuilderXWindowsExecutables(output)
    : extractHBuilderXMacOSExecutables(output)
}

export function extractHBuilderXMacOSExecutable(line: string) {
  return extractHBuilderXMacOSExecutables(line)[0]
}

export function extractHBuilderXWindowsExecutable(line: string) {
  return extractHBuilderXWindowsExecutables(line)[0]
}

export function extractHBuilderXExecutableFromProcessOutput(output: string, platform: NodeJS.Platform = process.platform) {
  return extractHBuilderXExecutablesFromProcessOutput(output, platform)[0]
}

export async function findRunningHBuilderXCliCandidates(platform: NodeJS.Platform = process.platform) {
  const command = platform === 'win32' ? 'powershell.exe' : 'ps'
  const args = platform === 'win32'
    ? ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', [
        '$ErrorActionPreference = \'Stop\'',
        '[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)',
        // 只使用语言和 .NET API，避免 ConvertTo-Json 首次自动加载 Utility 模块及扫描模块路径。
        `$PSModuleAutoLoadingPreference = 'None'`,
        `[Console]::Error.WriteLine('process-discovery: querying')`,
        `$paths = [System.Collections.Generic.List[string]]::new()`,
        `foreach ($p in [System.Diagnostics.Process]::GetProcessesByName('HBuilderX')) { try { $paths.Add([Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($p.MainModule.FileName))) } catch {} finally { $p.Dispose() } }`,
        `[Console]::Error.WriteLine('process-discovery: complete')`,
        `[Console]::WriteLine('WT-HBUILDERX-PROCESSES/1')`,
        `[Console]::WriteLine([string]::Join([Environment]::NewLine, $paths))`,
        `[Console]::WriteLine('END')`,
      ].join('; ')]
    : ['-ax', '-o', 'command=']
  const timeout = 15_000
  const maxAttempts = platform === 'win32' ? 3 : 1
  let result: SpawnSyncReturns<string> | undefined
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    result = spawnSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, timeout, maxBuffer: 1024 * 1024 })
    if (!result.error && result.status === 0) {
      break
    }
    const timedOut = result.signal === 'SIGTERM'
      || (result.error as NodeJS.ErrnoException | undefined)?.code === 'ETIMEDOUT'
    if (!timedOut || attempt === maxAttempts - 1) {
      break
    }
  }

  if (!result || result.error || result.status !== 0) {
    // 无法查询与没有实例是不同状态；误报后再次 open 可能干扰现有 IDE 会话。
    throw new Error(`HBuilderX 进程探测失败：${command}, exit=${result?.status}, signal=${result?.signal}, cwd=${process.cwd()}\n${result?.error?.message ?? ''}\n${result?.stderr ?? ''}\n${result?.stdout ?? ''}`)
  }

  let executables: string[]
  if (platform === 'win32') {
    const lines = result.stdout.replace(/^\uFEFF/, '').trim().split(/\r?\n/)
    if (lines.shift() !== 'WT-HBUILDERX-PROCESSES/1' || lines.pop() !== 'END') {
      throw new Error('HBuilderX Windows 进程探测返回了不完整的路径列表')
    }
    executables = lines.filter(Boolean).map((line) => {
      const bytes = Buffer.from(line, 'base64')
      const executable = bytes.toString('utf8')
      // 拒绝损坏的数据、相对路径与目录；不能将解析失败当作没有运行实例。
      if (bytes.toString('base64') !== line || !Buffer.from(executable).equals(bytes) || !path.win32.isAbsolute(executable) || path.win32.parse(executable).root.length < 3 || path.win32.basename(executable).toLowerCase() !== 'hbuilderx.exe') {
        throw new Error('HBuilderX Windows 进程探测返回了无效路径列表')
      }
      return executable
    })
  }
  else {
    executables = extractHBuilderXExecutablesFromProcessOutput(result.stdout, platform)
  }
  const paths = platform === 'win32' ? path.win32 : path.posix
  const candidates: string[] = []
  for (const executable of executables) {
    if (!(await fileExists(executable))) {
      continue
    }
    const cli = paths.join(paths.dirname(executable), platform === 'win32' ? 'cli.exe' : 'cli')
    if (await fileExists(cli)) {
      candidates.push(cli)
    }
  }
  return unique(candidates)
}

export async function findRunningHBuilderXCli(platform: NodeJS.Platform = process.platform) {
  return (await findRunningHBuilderXCliCandidates(platform))[0]
}

function sortByChannel(items: string[]) {
  const weights: Record<HBuilderXResolvedChannel, number> = {
    stable: 0,
    alpha: 1,
    unknown: 2,
  }
  return [...items].sort((left, right) => weights[inferHBuilderXChannel(left)] - weights[inferHBuilderXChannel(right)])
}

export function selectHBuilderXCliCandidatesForChannel(items: string[], channel: HBuilderXChannel) {
  if (channel === 'auto') {
    return sortByChannel(items)
  }
  return items.filter(item => inferHBuilderXChannel(item) === channel)
}

async function firstExisting(items: string[]) {
  for (const item of items) {
    if (await fileExists(item)) {
      return item
    }
  }
  return undefined
}

export async function resolveHBuilderXCliInfoFromOptions(options: HBuilderXCliResolveOptions = {}): Promise<HBuilderXCliResolution> {
  const env = options.env ?? process.env
  const channel = resolveHBuilderXChannel(options.channel ?? env['HBUILDERX_CHANNEL'])
  const running = await findRunningHBuilderXCliCandidates()

  const configured = await resolveConfiguredCli(options)
  if (configured) {
    return {
      ...configured,
      isRunning: running.some(item => normalizeFile(item) === normalizeFile(configured.path)),
      channel: inferHBuilderXChannel(configured.path),
    }
  }

  const runningCandidate = selectHBuilderXCliCandidatesForChannel(running, channel)[0]
  if (runningCandidate) {
    return {
      path: runningCandidate,
      isRunning: true,
      source: 'running-process',
      channel: inferHBuilderXChannel(runningCandidate),
    }
  }

  const defaultCandidate = await firstExisting(getDefaultHBuilderXCliCandidates({}, channel))
  if (defaultCandidate) {
    return {
      path: defaultCandidate,
      isRunning: false,
      source: 'default-path',
      channel: inferHBuilderXChannel(defaultCandidate),
    }
  }

  throw new Error([
    `未找到 HBuilderX ${channel === 'auto' ? '' : `${channel} `}CLI。`,
    '请安装 HBuilderX，或设置 HBUILDERX_CLI_PATH=/path/to/cli。',
  ].join(''))
}
