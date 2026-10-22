import type { RunContext } from './context'
import { randomUUID } from 'node:crypto'
import { lstat, mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { formatWorkflowError, runWithCleanup } from '../../scripts/e2e-preflight/cleanup'
import { formatLynxHarnessFailure } from '../lynx/native-failure'
import { EnvironmentBlockedError, environmentFailure, findEnvironmentBlock } from './environment-block'

export const stageBindingVariable = 'TAILWIND_E2E_STAGE_BINDING'
type Producer = 'lynx-native' | 'react-native' | 'expo-web' | 'weapp' | 'mini-builds'
export interface StageBinding {
  version: 1
  runId: string
  target: string
  invocationId: string
  producer: Producer
  file: string
}

/** 入口读取同一份生产者绑定，供终态与启动前诊断共同使用。 */
export function producerStageBinding(producer: Producer): StageBinding | undefined {
  const source = process.env[stageBindingVariable]
  if (!source) {
    return
  }
  const binding = parseBinding(source)
  if (binding.producer !== producer) {
    throw new EnvironmentBlockedError('阶段生产者与本次调用不符')
  }
  return binding
}

function registeredProducer(target: string): Producer | undefined {
  if (/^lynx-(?:android|ios)$/.test(target)) {
    return 'lynx-native'
  }
  if (/^react-native-(?:android|ios)$/.test(target)) {
    return 'react-native'
  }
  if (/^expo-(?:chromium|firefox|webkit)$/.test(target)) {
    return 'expo-web'
  }
  if (target === 'weapp' || target === 'mini-builds') {
    return target
  }
}

/** 每次调用拥有独立回执；嵌套调用必须覆盖继承的身份。 */
export function createStageBinding(context: RunContext, target: string): StageBinding | undefined {
  const producer = registeredProducer(target)
  if (!producer) {
    return
  }
  const invocationId = randomUUID()
  return { version: 1, runId: context.runId, target, invocationId, producer, file: path.resolve(context.directory, 'stage-receipts', `${invocationId}.json`) }
}

function parseBinding(source: string): StageBinding {
  const value = JSON.parse(source) as StageBinding
  if (!value || value.version !== 1 || typeof value.runId !== 'string' || !value.runId.trim()
    || typeof value.target !== 'string' || !registeredProducer(value.target) || registeredProducer(value.target) !== value.producer
    || typeof value.invocationId !== 'string' || !/^[a-f\d-]{36}$/.test(value.invocationId)
    || typeof value.file !== 'string' || !path.isAbsolute(value.file)) {
    throw new EnvironmentBlockedError('阶段调用身份无效')
  }
  return value
}

function ownedEnvironmentFailure(error: unknown): string | undefined {
  const typed = findEnvironmentBlock(error)
  if (typed) {
    return typed.message
  }
  const seen = new Set<unknown>()
  const pending = [error]
  while (pending.length) {
    const current = pending.pop()
    if (!(current instanceof Error) || seen.has(current)) {
      continue
    }
    seen.add(current)
    // 仅生产入口持有的本次异常可分类；聚合 stdout 不进入此边界。
    const own = processEnvironmentFailure(current) ?? environmentFailure(formatLynxHarnessFailure(current) ?? String(current))
    if (own) {
      return own
    }
    pending.push(current.cause, ...(current instanceof AggregateError ? current.errors : []))
  }
}

/** 宿主收尾完成后写终态，缺失或错误身份的回执不能放行。 */
export async function runStageProducer<T>(producer: Producer, run: () => Promise<T>): Promise<T> {
  const binding = producerStageBinding(producer)
  if (!binding) {
    return run()
  }
  await mkdir(path.dirname(binding.file), { recursive: true })
  let status: 'completed' | 'failed' | 'blocked' = 'completed'
  let diagnostic: string | undefined
  let reason: string | undefined
  return runWithCleanup(async () => {
    try {
      return await run()
    }
    catch (error) {
      diagnostic = formatWorkflowError(error).slice(0, 16_384)
      reason = ownedEnvironmentFailure(error)
      status = reason ? 'blocked' : 'failed'
      throw error
    }
  }, async () => {
    await writeFile(binding.file, `${JSON.stringify({ ...binding, status, diagnostic, reason }, null, 2)}\n`, { flag: 'wx' })
  })
}

/** 仅读取本次登记的路径，不从合并日志或其它目标恢复控制信号。 */
export async function readStageReceipt(binding: StageBinding): Promise<'completed' | 'failed'> {
  try {
    const info = await lstat(binding.file)
    if (!info.isFile() || info.isSymbolicLink() || info.size > 65_536) {
      throw new Error('回执不是有效文件')
    }
    const source = await readFile(binding.file, 'utf8')
    const value = JSON.parse(source) as Record<string, unknown>
    if (Object.entries(binding).some(([key, expected]) => value[key] !== expected)
      || !['completed', 'failed', 'blocked'].includes(String(value['status']))
      || (value['status'] === 'blocked' && (typeof value['reason'] !== 'string' || !value['reason'].trim()))
      || (value['status'] !== 'blocked' && value['reason'] !== undefined)
      || (value['status'] === 'failed' && (typeof value['diagnostic'] !== 'string' || !value['diagnostic'].trim()))) {
      throw new Error('回执身份或终态不符')
    }
    if (value['status'] === 'blocked') {
      throw new EnvironmentBlockedError(`${binding.target} 环境故障：${value['reason']}；${binding.file}`)
    }
    return value['status'] as 'completed' | 'failed'
  }
  catch (error) {
    if (error instanceof EnvironmentBlockedError) {
      throw error
    }
    throw new EnvironmentBlockedError(`${binding.target} 本次终态回执缺失或无效；${binding.file}`, { cause: error })
  }
}

/** 父进程自身的启动与超时故障使用 Execa 字段，不匹配子进程文字。 */
export function processEnvironmentFailure(error: unknown): string | undefined {
  if (!error || typeof error !== 'object' || !('isExecaError' in error) || error.isExecaError !== true) {
    return
  }
  if ('code' in error && error.code === 'ENOENT') {
    return '调度进程无法启动命令（ENOENT）'
  }
  if ('timedOut' in error && error.timedOut === true) {
    return '调度进程命令超时'
  }
}
