import type { MemoryProcessSample, MemoryUsageSample } from '../types'
import { Buffer } from 'node:buffer'
import process from 'node:process'
import { samplePosixProcessTreeMemory } from './posix'
import { runMemoryProbe } from './probe'
import { createWindowsProcessTreeMemoryScript } from './windows'

export { createWindowsProcessTreeMemoryScript } from './windows'

export function parseProcessTreeMemoryOnWindows(stdout: string): Omit<MemoryUsageSample, 'at'> | undefined {
  try {
    const parsed = JSON.parse(stdout.trim()) as Partial<Omit<MemoryUsageSample, 'at'>>
    if (
      typeof parsed.rssMb !== 'number' || !Number.isFinite(parsed.rssMb) || parsed.rssMb < 0
      || typeof parsed.maxProcessRssMb !== 'number' || !Number.isFinite(parsed.maxProcessRssMb) || parsed.maxProcessRssMb < 0
      || typeof parsed.processCount !== 'number' || !Number.isInteger(parsed.processCount) || parsed.processCount <= 0
    ) {
      return undefined
    }
    const topProcesses = normalizeWindowsTopProcesses(parsed.topProcesses)
    return {
      rssMb: parsed.rssMb,
      maxProcessRssMb: parsed.maxProcessRssMb,
      processCount: parsed.processCount,
      ...(topProcesses.length > 0 ? { topProcesses } : {}),
    }
  }
  catch {
    return undefined
  }
}

function normalizeWindowsTopProcesses(value: unknown): MemoryProcessSample[] {
  const rows = Array.isArray(value)
    ? value
    : value && typeof value === 'object'
      ? [value]
      : []
  return rows
    .map((row) => {
      const item = row as Partial<MemoryProcessSample>
      if (
        typeof item.pid !== 'number'
        || typeof item.ppid !== 'number'
        || typeof item.rssMb !== 'number'
      ) {
        return undefined
      }
      return {
        pid: item.pid,
        ppid: item.ppid,
        rssMb: item.rssMb,
        ...(typeof item.command === 'string' && item.command ? { command: item.command } : {}),
      }
    })
    .filter((item): item is MemoryProcessSample => item != null)
}

/** 异步采集进程树内存；探针数据不能作为进程归属或清理依据。 */
export async function sampleProcessTreeMemory(rootPid: number | undefined, signal: AbortSignal, cwd = process.cwd()): Promise<MemoryUsageSample> {
  if (rootPid == null) {
    throw new Error('memory probe root process is unavailable')
  }
  const windows = process.platform === 'win32'
  const timeoutMs = windows ? 5000 : 1000
  const expiresAt = Date.now() + timeoutMs
  const sample = windows
    ? parseProcessTreeMemoryOnWindows(await runMemoryProbe('powershell', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(createWindowsProcessTreeMemoryScript(rootPid, cwd), 'utf16le').toString('base64')], { signal, timeoutMs }))
    : await samplePosixProcessTreeMemory(rootPid, signal, expiresAt)
  if (Date.now() >= expiresAt) {
    throw new Error(`memory probe exceeded ${timeoutMs}ms deadline before sample acceptance`)
  }
  if (!sample || sample.processCount === 0) {
    throw new Error('memory probe did not return a valid process tree sample')
  }
  return { at: Date.now(), ...sample }
}
