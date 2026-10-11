import type { HBuilderXCommandResult, HBuilderXIssueKind, HBuilderXResolvedChannel } from '../types'
import { wait } from '../fs'
import { createTimeoutIssue, formatRecentLogs } from '../logs'
import { HBuilderXCommandError, runCommand } from '../process'

const ansiRE = new RegExp(`${String.fromCharCode(27)}\\[[\\d;]*m`, 'g')

export function stripAnsi(value: string) {
  return value.replace(ansiRE, '')
}

/** CLI 的未启动协议响应因界面语言不同而变化，不能作为 host 名称解析。 */
function isStoppedHostDiagnostic(line: string) {
  return /^(?:HBuilderX is not detected running\. Please execute cli open.*|没有可用的命令[，,]尝试使用\s*cli open|未检测到已打开的\s*HBuilderX[，,]请先执行\s*cli open.*)$/i.test(line.trim())
}

export function parseHBuilderXHosts(output: string) {
  return [...new Set(stripAnsi(output)
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.length > 0 && !isStoppedHostDiagnostic(line) && !/^-?\d+:cli:|命令.+(?:不存在|错误)|not detected running/i.test(line)))]
}

export function parseHBuilderXVersion(output: string) {
  return stripAnsi(output).match(/\b(\d+\.\d+(?:\.\d+)+(?:-[0-9a-z.-]+)?)\b/i)?.[1]
}

export function inferHBuilderXChannelFromVersion(version: string): HBuilderXResolvedChannel {
  return /(?:^|-)alpha(?:\.|$)/i.test(version) ? 'alpha' : 'stable'
}

export function createRunnerError(
  cliPath: string,
  cwd: string,
  args: string[],
  kind: Extract<HBuilderXIssueKind, 'cli-instance-mismatch' | 'cli-host-ambiguous'>,
  message: string,
  hint: string,
  logs: string[],
) {
  const output = formatRecentLogs(logs)
  return new HBuilderXCommandError([
    `${message}: ${cliPath} ${args.join(' ')}`,
    `cwd=${cwd}`,
    `issue=${kind}: ${message}`,
    `hint=${hint}`,
    output,
  ].filter(Boolean).join('\n'), {
    command: cliPath,
    args,
    cwd,
    exit: { code: null, signal: null },
    logs,
    output,
    issue: { kind, message, hint },
  })
}

interface HostOptions {
  cliPath: string
  cwd: string
  env: Record<string, string | undefined>
  expectedChannel: HBuilderXResolvedChannel
  explicitHost?: string
  timeoutMs: number
}

export async function connectHBuilderXHost(options: HostOptions) {
  const { cliPath, cwd, env, expectedChannel, explicitHost } = options
  const deadline = Date.now() + options.timeoutMs
  const logs: string[] = []
  const timeoutError = (args: string[]) => new HBuilderXCommandError(`HBuilderX host 连接超时：${cliPath} ${args.join(' ')}\ncwd=${cwd}\nexit=null\nissue=timeout\n${formatRecentLogs(logs)}`, {
    command: cliPath,
    args,
    cwd,
    exit: { code: null, signal: null },
    logs,
    output: formatRecentLogs(logs),
    issue: createTimeoutIssue(),
  })
  const command = async (args: string[], maxTimeoutMs = 10_000) => {
    const remaining = deadline - Date.now()
    if (remaining <= 0) {
      throw timeoutError(args)
    }
    const result = await runCommand({ command: cliPath, args, cwd, env, timeoutMs: Math.min(remaining, maxTimeoutMs), allowFailure: true })
    logs.push(...result.logs)
    if (logs.length > 160) {
      logs.splice(0, logs.length - 160)
    }
    return result
  }
  const assertCommand = (result: HBuilderXCommandResult) => {
    if (result.issue.kind === 'cli-instance-mismatch' || result.issue.kind === 'cli-host-ambiguous') {
      throw createRunnerError(cliPath, cwd, result.args, result.issue.kind, result.issue.message, result.issue.hint ?? '请检查目标 HBuilderX host。', logs)
    }
    if (result.issue.kind === 'timeout' || result.exit.code !== 0) {
      throw new HBuilderXCommandError(`HBuilderX host 命令失败：${cliPath} ${result.args.join(' ')}\ncwd=${cwd}\nexit=${result.exit.signal ?? result.exit.code}\nissue=${result.issue.kind}\n${formatRecentLogs(logs)}`, result)
    }
  }
  const probe = async () => {
    const listed = await command(['listhost'])
    // 原生 CLI 用诊断文本表示没有实例；该有效协议响应可以带非零退出码。
    const absent = listed.issue.kind !== 'timeout' && stripAnsi(listed.output).split(/\r?\n/).some(isStoppedHostDiagnostic)
    if (!absent) {
      assertCommand(listed)
    }
    const hosts = parseHBuilderXHosts(listed.output)
    const compatible: Array<{ host: string, version: string, channel: HBuilderXResolvedChannel }> = []
    for (const host of explicitHost ? [explicitHost] : hosts) {
      const result = await command(['version', '--host', host])
      assertCommand(result)
      const version = parseHBuilderXVersion(result.output)
      if (!version) {
        throw createRunnerError(cliPath, cwd, result.args, 'cli-instance-mismatch', `无法验证 HBuilderX host=${host} 的版本`, '请检查目标实例是否就绪。', logs)
      }
      const channel = inferHBuilderXChannelFromVersion(version)
      if (expectedChannel === 'unknown' || channel === expectedChannel) {
        compatible.push({ host, version, channel })
      }
    }
    if (compatible.length > 1) {
      throw createRunnerError(cliPath, cwd, ['listhost'], 'cli-host-ambiguous', `检测到多个匹配的 HBuilderX host：${compatible.map(item => item.host).join(', ')}`, '请设置 HBUILDERX_HOST，或显式传入 host。', logs)
    }
    if (!compatible.length && (hosts.length || explicitHost)) {
      throw createRunnerError(cliPath, cwd, ['listhost'], 'cli-instance-mismatch', `未找到与 ${expectedChannel} CLI 匹配的 HBuilderX host`, '请检查 HBUILDERX_CLI_PATH、HBUILDERX_CHANNEL 和 HBUILDERX_HOST。', logs)
    }
    return compatible[0]
  }

  // CLI 的 host 握手决定连接状态；进程枚举仅用于未配置路径时发现安装位置。
  const existing = await probe()
  if (existing) {
    return existing
  }
  assertCommand(await command(['open'], options.timeoutMs))
  do {
    const selected = await probe()
    if (selected) {
      return selected
    }
    await wait(Math.min(500, Math.max(0, deadline - Date.now())))
  } while (Date.now() < deadline)
  throw timeoutError(['listhost'])
}
