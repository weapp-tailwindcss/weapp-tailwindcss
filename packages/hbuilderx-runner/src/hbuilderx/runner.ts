import type {
  HBuilderXCliResolveOptions,
  HBuilderXLaunchOptions,
  HBuilderXNativeCommandOptions,
  HBuilderXRunner,
  HBuilderXRunnerOptions,
} from '../types'
import path from 'node:path'
import process from 'node:process'
import { runCommand, spawnCommand } from '../process'
import { resolveConfiguredCli } from './configured-cli'
import { inferHBuilderXChannel, resolveHBuilderXChannel, resolveHBuilderXCliInfoFromOptions } from './discovery'

import { connectHBuilderXHost } from './hosts'

export { inferHBuilderXChannelFromVersion, parseHBuilderXHosts, parseHBuilderXVersion, stripAnsi } from './hosts'

const defaultStartupTimeoutMs = 60_000

export function createHBuilderXNativeLaunchArgs(options: HBuilderXLaunchOptions) {
  const args = ['launch', options.platform, '--project', path.resolve(options.cwd), ...(options.args ?? [])]
  if (options.compile != null && !args.includes('--compile')) {
    args.push('--compile', String(options.compile))
  }
  if (options.runtimeLog != null && !args.includes('--runtime-log')) {
    args.push('--runtime-log', String(options.runtimeLog))
  }
  return args
}

function bindHost(args: string[], host: string) {
  const hostIndex = args.indexOf('--host')
  if (hostIndex < 0) {
    return [...args, '--host', host]
  }
  if (args[hostIndex + 1] !== host) {
    throw new Error(`runner 已绑定 HBuilderX host=${host}，不能改为 ${args[hostIndex + 1] ?? '空值'}。`)
  }
  return args
}

export async function createHBuilderXRunner(options: HBuilderXRunnerOptions = {}): Promise<HBuilderXRunner> {
  const env = {
    ...process.env,
    ...options.env,
  }
  const cwd = options.cwd ?? process.cwd()
  const timeoutMs = options.timeoutMs ?? defaultStartupTimeoutMs
  const candidates = options.hbuilderxCliPath ? [options.hbuilderxCliPath] : options.candidates
  const resolveOptions: HBuilderXCliResolveOptions = {
    ...(candidates !== undefined ? { candidates } : {}),
    ...(options.channel !== undefined ? { channel: options.channel } : {}),
    env,
    ...(options.host !== undefined ? { host: options.host } : {}),
  }
  const configured = await resolveConfiguredCli(resolveOptions)
  const resolution = configured
    ? { ...configured, channel: inferHBuilderXChannel(configured.path) }
    : await resolveHBuilderXCliInfoFromOptions(resolveOptions)
  const cliEnv = {
    ...env,
    HBUILDERX_CLI_PATH: resolution.path,
  }

  const requestedChannel = resolveHBuilderXChannel(options.channel ?? env['HBUILDERX_CHANNEL'])
  const expectedChannel = resolution.channel !== 'unknown'
    ? resolution.channel
    : requestedChannel === 'auto' ? inferHBuilderXChannel(resolution.path) : requestedChannel
  const explicitHost = options.host ?? env['HBUILDERX_HOST']
  const selected = await connectHBuilderXHost({
    cliPath: resolution.path,
    cwd,
    env: cliEnv,
    expectedChannel,
    ...(explicitHost !== undefined ? { explicitHost } : {}),
    timeoutMs,
  })

  const boundResolution = {
    ...resolution,
    isRunning: true,
    channel: selected.channel,
    host: selected.host,
    version: selected.version,
  }
  const run = async (commandOptions: HBuilderXNativeCommandOptions) => await runCommand({
    ...commandOptions,
    command: resolution.path,
    args: bindHost(commandOptions.args, selected.host),
    cwd: commandOptions.cwd ?? cwd,
    env: {
      ...cliEnv,
      ...commandOptions.env,
    },
  })
  const spawn = (commandOptions: HBuilderXNativeCommandOptions) => spawnCommand({
    ...commandOptions,
    command: resolution.path,
    args: bindHost(commandOptions.args, selected.host),
    cwd: commandOptions.cwd ?? cwd,
    env: {
      ...cliEnv,
      ...commandOptions.env,
    },
  })

  const runner: HBuilderXRunner = {
    resolution: boundResolution,
    run,
    spawn,
    async closeProject(projectOptions) {
      return await run({
        ...projectOptions,
        args: ['project', 'close', '--path', path.resolve(projectOptions.cwd)],
        allowFailure: projectOptions.allowFailure ?? true,
      })
    },
    async openProject(projectOptions) {
      return await run({
        ...projectOptions,
        args: ['project', 'open', '--path', path.resolve(projectOptions.cwd)],
      })
    },
    async prepareProject(projectOptions) {
      await runner.closeProject({ ...projectOptions, allowFailure: true })
      return await runner.openProject(projectOptions)
    },
    async launchProject(launchOptions) {
      return await run({
        ...launchOptions,
        args: createHBuilderXNativeLaunchArgs(launchOptions),
      })
    },
    startLaunch(launchOptions) {
      return spawn({
        ...launchOptions,
        args: createHBuilderXNativeLaunchArgs(launchOptions),
      })
    },
  }
  return runner
}
