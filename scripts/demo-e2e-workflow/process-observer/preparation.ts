import { parseWindowsMemorySample } from '../../demo-e2e-memory/windows'
import { parseWindowsProcesses } from '../process-table'

/** 同一真实快照必须同时证明采集器出生身份与非零内存；结果仅用于启动验证。 */
export function parseObserverPreparation(value: unknown, pid: number) {
  const result = value as { identities?: unknown, memory?: unknown } | undefined
  const identities = parseWindowsProcesses(JSON.stringify(result?.identities))
  if (identities.length !== 1 || identities[0]!.pid !== pid) {
    throw new Error('身份采集器准备结果缺少唯一本体出生身份，不能启动业务。')
  }
  const identity = identities[0]!
  const memory = parseWindowsMemorySample(result?.memory)
  const root = memory.topProcesses?.[0]
  if (memory.processCount !== 1 || memory.topProcesses?.length !== 1 || root?.pid !== pid || root.ppid !== identity.parent
    || memory.rssMb <= 0 || root.rssMb !== memory.rssMb || memory.maxProcessRssMb !== memory.rssMb) {
    throw new Error('身份采集器准备内存与本体快照身份不一致，不能启动业务。')
  }
}
