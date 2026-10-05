import type { NativePlatform } from './native-options'
import fs from 'node:fs/promises'
import path from 'node:path'

export type NativeRunStage = 'device-discovery' | 'host-preparation' | 'bundle-build' | 'bundle-staging' | 'native-run' | 'report-validation'

function commandFailure(error: unknown, seen = new Set<object>()) {
  const result: Record<string, unknown> = error instanceof Error
    ? { name: error.name, message: error.message, stack: error.stack }
    : { message: String(error) }
  if (error && typeof error === 'object') {
    if (seen.has(error)) {
      return { message: '重复引用的异常' }
    }
    seen.add(error)
    // 仅保存命令结果字段，不序列化 Execa 的环境或其他运行配置。
    for (const key of ['code', 'exitCode', 'signal', 'timedOut', 'durationMs'] as const) {
      const value = Reflect.get(error, key)
      if (['string', 'number', 'boolean'].includes(typeof value)) {
        result[key] = value
      }
    }
    if (error instanceof AggregateError) {
      result.errors = error.errors.map(item => commandFailure(item, seen))
    }
    if (error instanceof Error && error.cause !== undefined) {
      result.cause = commandFailure(error.cause, seen)
    }
  }
  return result
}

/** CLI 与附件共用安全错误字段，聚合失败也不得隐藏原始异常。 */
export function formatNativeFailure(error: unknown): string {
  return JSON.stringify(commandFailure(error), null, 2)
}

/** 设备发现和准备也属于本轮执行；在任何外部命令之前创建证据目录。 */
export async function withNativeArtifacts<T>(platform: NativePlatform, artifactDir: string, run: (setStage: (stage: NativeRunStage) => void) => Promise<T>): Promise<T> {
  await fs.mkdir(path.dirname(artifactDir), { recursive: true })
  // 整个输出目录仅属于一次执行，准备阶段失败也不能留下可被误认成本轮的旧报告。
  await fs.mkdir(artifactDir)
  const startedAt = new Date().toISOString()
  let stage: NativeRunStage = 'device-discovery'
  try {
    return await run((next) => {
      stage = next
    })
  }
  catch (error) {
    const report = { platform, stage, startedAt, failedAt: new Date().toISOString(), error: commandFailure(error) }
    const results = await Promise.allSettled([
      fs.writeFile(path.join(artifactDir, 'failure.txt'), `${formatNativeFailure(error)}\n`),
      fs.writeFile(path.join(artifactDir, 'failure.json'), `${JSON.stringify(report, null, 2)}\n`),
    ])
    const failures = results.filter(result => result.status === 'rejected').map(result => result.reason)
    if (failures.length > 0) {
      throw new AggregateError([error, ...failures], 'Lynx 运行失败，且部分失败证据无法写入。')
    }
    throw error
  }
}
