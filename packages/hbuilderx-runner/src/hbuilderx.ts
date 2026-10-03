import type { HBuilderXCliResolveOptions, HBuilderXLaunchOptions, HBuilderXProjectOptions } from './types'
import path from 'node:path'
import process from 'node:process'
import { resolveConfiguredCli } from './hbuilderx/configured-cli'
import {
  getDefaultHBuilderXCliCandidates,
  resolveHBuilderXChannel,
  resolveHBuilderXCliInfoFromOptions,
} from './hbuilderx/discovery'
import { createHBuilderXRunner } from './hbuilderx/runner'
import { runCommand, spawnCommand } from './process'

export async function resolveHBuilderXCliInfo(options?: HBuilderXCliResolveOptions): ReturnType<typeof resolveHBuilderXCliInfoFromOptions>
export async function resolveHBuilderXCliInfo(candidates?: string[], env?: NodeJS.ProcessEnv): ReturnType<typeof resolveHBuilderXCliInfoFromOptions>
export async function resolveHBuilderXCliInfo(
  candidatesOrOptions?: string[] | HBuilderXCliResolveOptions,
  env: NodeJS.ProcessEnv = process.env,
) {
  return await resolveHBuilderXCliInfoFromOptions(Array.isArray(candidatesOrOptions)
    ? { candidates: candidatesOrOptions, env }
    : candidatesOrOptions)
}

export async function resolveHBuilderXCli(options?: HBuilderXCliResolveOptions): Promise<string>
export async function resolveHBuilderXCli(candidates?: string[]): Promise<string>
export async function resolveHBuilderXCli(candidatesOrOptions?: string[] | HBuilderXCliResolveOptions) {
  const options = Array.isArray(candidatesOrOptions) ? { candidates: candidatesOrOptions } : candidatesOrOptions ?? {}
  resolveHBuilderXChannel(options.channel ?? (options.env ?? process.env)['HBUILDERX_CHANNEL'])
  const configured = await resolveConfiguredCli(options)
  return configured?.path ?? (await resolveHBuilderXCliInfoFromOptions(options)).path
}

export function createHBuilderXEnv(options: { hbuilderxCliPath?: string, env?: Record<string, string | undefined> } = {}) {
  return {
    ...options.env,
    HBUILDERX_CLI_PATH: options.hbuilderxCliPath ?? options.env?.['HBUILDERX_CLI_PATH'] ?? process.env['HBUILDERX_CLI_PATH'] ?? getDefaultHBuilderXCliCandidates()[0],
    NODE_OPTIONS: options.env?.['NODE_OPTIONS'] ?? process.env['NODE_OPTIONS'] ?? '--max-old-space-size=8192',
  }
}

export function hbuilderxPnpmArgs(args: string[]) {
  return ['exec', 'hbuilderx', ...args]
}

export async function runPnpmCommand(options: HBuilderXProjectOptions & { args: string[] }) {
  return await runCommand({
    command: 'pnpm',
    args: options.args,
    cwd: options.cwd,
    ...(options.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {}),
    ...(options.allowFailure !== undefined ? { allowFailure: options.allowFailure } : {}),
    env: createHBuilderXEnv(options),
  })
}

export function spawnPnpmCommand(options: HBuilderXProjectOptions & { args: string[] }) {
  return spawnCommand({
    command: 'pnpm',
    args: options.args,
    cwd: options.cwd,
    env: createHBuilderXEnv(options),
  })
}

export async function closeProject(options: HBuilderXProjectOptions) {
  const runner = await createHBuilderXRunner(options)
  return await runner.closeProject(options)
}

export async function openProject(options: HBuilderXProjectOptions) {
  const runner = await createHBuilderXRunner(options)
  return await runner.openProject(options)
}

export async function prepareProject(options: HBuilderXProjectOptions) {
  const runner = await createHBuilderXRunner(options)
  return await runner.prepareProject(options)
}

export function createLaunchArgs(options: HBuilderXLaunchOptions) {
  const args = ['launch', options.platform, '--project', path.resolve(options.cwd), ...(options.args ?? [])]
  if (options.compile != null && !args.includes('--compile')) {
    args.push('--compile', String(options.compile))
  }
  if (options.runtimeLog != null && !args.includes('--runtime-log')) {
    args.push('--runtime-log', String(options.runtimeLog))
  }
  return hbuilderxPnpmArgs(args)
}

export async function launchProject(options: HBuilderXLaunchOptions) {
  const runner = await createHBuilderXRunner(options)
  return await runner.launchProject(options)
}

/**
 * @deprecated 需要固定 stable/alpha 与 host 时，请使用 `createHBuilderXRunner().startLaunch()`。
 */
export function startLaunch(options: HBuilderXLaunchOptions) {
  return spawnPnpmCommand({
    ...options,
    args: createLaunchArgs(options),
  })
}

export * from './hbuilderx/discovery'
export * from './hbuilderx/runner'
