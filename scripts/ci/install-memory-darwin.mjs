import { execFileSync } from 'node:child_process'
import process from 'node:process'

/** libuv 1.52 起，Darwin available memory 才包含 inactive 和 purgeable 页。 */
export function needsDarwinMemoryProbe(platform = process.platform, libuvVersion = process.versions.uv) {
  if (platform !== 'darwin') {
    return false
  }
  const version = /^(\d+)\.(\d+)\.(\d+)$/.exec(libuvVersion)
  if (!version) {
    throw new Error('无法确认 Darwin libuv 的内存统计语义')
  }
  const major = Number(version[1])
  const minor = Number(version[2])
  const patch = Number(version[3])
  if (![major, minor, patch].every(Number.isSafeInteger)) {
    throw new Error('无法确认 Darwin libuv 的内存统计语义')
  }
  return major < 1 || (major === 1 && minor < 52)
}

/**
 * 严格解析 vm_stat，仅累加 libuv 1.52 所使用的三类页，不计 wired、压缩或 speculative 页。
 * @param {string} output vm_stat 在 C locale 下的输出。
 */
export function parseDarwinAvailableMemory(output) {
  const lines = output.trim().split(/\r?\n/)
  const header = /^Mach Virtual Memory Statistics: \(page size of (\d+) bytes\)$/.exec(lines[0] ?? '')
  const pageBytes = Number(header?.[1])
  if (!Number.isSafeInteger(pageBytes) || pageBytes < 4096 || pageBytes > 65536 || !Number.isInteger(Math.log2(pageBytes))) {
    throw new Error('无法解析 Darwin vm_stat 的 page size')
  }
  const counts = new Map()
  for (const line of lines.slice(1)) {
    const trimmed = line.trim()
    const match = /^Pages (free|inactive|purgeable):\s+(\d+)\.$/.exec(trimmed)
    if (!match) {
      if (/^Pages (?:free|inactive|purgeable):/.test(trimmed)) {
        throw new Error('无法解析 Darwin vm_stat 的页计数')
      }
      continue
    }
    const count = Number(match[2])
    if (counts.has(match[1]) || !Number.isSafeInteger(count) || count < 0) {
      throw new Error('无法解析 Darwin vm_stat 的页计数')
    }
    counts.set(match[1], count)
  }
  if (counts.size !== 3) {
    throw new Error('Darwin vm_stat 缺少完整的可用页计数')
  }
  const bytes = [...counts.values()].reduce((sum, count) => sum + count, 0) * pageBytes
  if (!Number.isSafeInteger(bytes) || bytes <= 0) {
    throw new Error('Darwin vm_stat 未提供安全的可用内存读数')
  }
  return bytes
}

/**
 * 限时读取 Darwin 系统工具；locale 只作用于读取子进程，失败不回退到不完整的 free 页。
 * @param {(file: string, options: import('node:child_process').ExecFileSyncOptionsWithStringEncoding) => string} [runner] 系统读取入口。
 */
export function readDarwinAvailableMemory(runner = execFileSync) {
  let output
  try {
    output = runner('/usr/bin/vm_stat', {
      encoding: 'utf8',
      timeout: 5000,
      maxBuffer: 64 * 1024,
      env: { ...process.env, LC_ALL: 'C', LANG: 'C' },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  }
  catch (cause) {
    throw new Error('无法读取 Darwin vm_stat 的安全安装内存预算', { cause })
  }
  return parseDarwinAvailableMemory(output)
}
