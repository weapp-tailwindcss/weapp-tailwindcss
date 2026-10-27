import { execa } from 'execa'

export interface NativeProcessIdentity {
  pid: number
  parentPid: number
  startedAt: string
  executable: string
}

/** 只读原命令的内核进程身份；不扫描命令参数，不查询或干预设备。 */
export async function readNativeProcessIdentity(pid: number, cancelSignal: AbortSignal): Promise<NativeProcessIdentity> {
  if (!Number.isSafeInteger(pid) || pid <= 0) {
    throw new Error('Native diagnostic process PID must be a positive safe integer')
  }
  const result = await execa('ps', ['-p', String(pid), '-o', 'pid=,ppid=,lstart=,comm='], {
    cancelSignal,
    timeout: 1_000,
    killSignal: 'SIGKILL',
    maxBuffer: 16 * 1024,
    env: { LC_ALL: 'C' },
  })
  const lines = result.stdout.trim().split(/\r?\n/)
  const fields = lines.length === 1 && /^(\d+)\s+(\d+)\s+(\S+)\s+(\S+)\s+(\d{1,2})\s+(\d{2}:\d{2}:\d{2})\s+(\d{4})\s+(\S.*)$/.exec(lines[0]!)
  if (!fields || Number(fields[1]) !== pid || !Number.isSafeInteger(Number(fields[2])) || Number(fields[2]) <= 0) {
    throw new Error('Native diagnostic process identity is unavailable or ambiguous')
  }
  return { pid, parentPid: Number(fields[2]), startedAt: fields.slice(3, 8).join(' '), executable: fields[8]! }
}
