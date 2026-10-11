import { execFileSync } from 'node:child_process'
import { cpus, platform, release, arch, totalmem } from 'node:os'
import { repoRoot } from './paths'

export interface EnvInfo {
  timestamp: string
  commit: string
  node: string
  platform: string
  release: string
  arch: string
  cpu: string
  totalMemoryBytes: number
}

export function collectEnv(): EnvInfo {
  let commit = 'unknown'
  try {
    commit = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: repoRoot,
      encoding: 'utf8',
    }).trim()
  }
  catch {
    commit = 'unknown'
  }

  return {
    timestamp: new Date().toISOString(),
    commit,
    node: process.version,
    platform: platform(),
    release: release(),
    arch: arch(),
    cpu: cpus()[0]?.model ?? 'unknown',
    totalMemoryBytes: totalmem(),
  }
}
