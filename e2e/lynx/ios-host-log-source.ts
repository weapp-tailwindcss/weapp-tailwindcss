import type { IosBuildTarget } from './native-device'
import { createHash } from 'node:crypto'
import path from 'node:path'

export type IosHostLogSource = { status: 'unavailable', reason: string } | {
  status: 'bound'
  logPath: string
  deviceId: string
  runtime: string
  runId: string
  runAttempt: string
  sha: string
  inventorySha256: string
}

/** 仅消费已经验证归属的库存；诊断字段缺失不能改变原设备的执行身份。 */
export function bindIosHostLogs(inventory: string, target: IosBuildTarget, identity: { runId: string, runAttempt: string }, sha: string): IosHostLogSource {
  const parsed = JSON.parse(inventory) as { devices: Record<string, Array<{ udid?: unknown, logPath?: unknown }>> }
  const entries = Object.entries(parsed.devices).flatMap(([runtime, devices]) => devices.map(device => ({ ...device, runtime })))
  const matches = entries.filter(device => device.udid === target.id)
  const logPath = matches.length === 1 && matches[0]?.runtime === target.runtime ? matches[0].logPath : undefined
  if (typeof logPath !== 'string' || logPath.includes('\0') || !path.isAbsolute(logPath)
    || path.basename(path.normalize(logPath)) !== target.id) {
    return { status: 'unavailable', reason: '已绑定设备的库存没有可用的独占绝对日志目录。' }
  }
  return {
    status: 'bound',
    logPath: path.normalize(logPath),
    deviceId: target.id,
    runtime: target.runtime,
    ...identity,
    sha,
    inventorySha256: createHash('sha256').update(inventory).digest('hex'),
  }
}

/** 文件系统边界使用宿主路径语义；不把同名前缀、其他盘符或相对路径当成子目录。 */
export function isInsideLogDirectory(root: string, file: string, paths = path) {
  if (!paths.isAbsolute(root) || !paths.isAbsolute(file)) {
    return false
  }
  const relative = paths.relative(root, file)
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${paths.sep}`) && !paths.isAbsolute(relative)
}
