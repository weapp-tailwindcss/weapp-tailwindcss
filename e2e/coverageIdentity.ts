import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { execa } from 'execa'
import { COVERAGE_REGISTRY } from './coverageRegistry'
import { getCatalogHash as getLynxCatalogHash } from './lynx/catalog'
import { RN_CATALOG_HASH } from './react-native/catalog'

export interface CoverageIdentity {
  commitSha: string
  treeSha: string
  lockfileSha: string
  registryHash: string
  catalogHashes: Record<string, string>
  toolchain: Record<string, string>
}

function sha256(value: string | Uint8Array) {
  return createHash('sha256').update(value).digest('hex')
}

async function git(repoRoot: string, args: string[]) {
  const result = await execa('git', args, { cwd: repoRoot })
  return result.stdout.trim()
}

export async function collectCoverageIdentity(repoRoot = process.cwd()): Promise<CoverageIdentity> {
  const commitSha = process.env['GITHUB_SHA'] || await git(repoRoot, ['rev-parse', 'HEAD'])
  const treeSha = await git(repoRoot, ['rev-parse', `${commitSha}^{tree}`])
  const lockfile = await readFile(path.join(repoRoot, 'pnpm-lock.yaml'))
  let pnpmVersion = 'unknown'
  try {
    pnpmVersion = (await execa('pnpm', ['--version'], { cwd: repoRoot })).stdout.trim()
  }
  catch {
    // release 校验会拒绝 unknown toolchain；本地诊断仍保留原始错误。
  }
  return {
    commitSha,
    treeSha,
    lockfileSha: sha256(lockfile),
    registryHash: sha256(JSON.stringify(COVERAGE_REGISTRY)),
    catalogHashes: {
      'react-native': RN_CATALOG_HASH,
      'lynx': getLynxCatalogHash(),
    },
    toolchain: {
      node: process.version,
      pnpm: pnpmVersion,
      runnerOs: process.env['RUNNER_OS'] ?? process.platform,
    },
  }
}

export function compareCoverageIdentity(actual: CoverageIdentity, expected: CoverageIdentity) {
  const normalize = (value: unknown): unknown => {
    if (Array.isArray(value)) {
      return value.map(normalize)
    }
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, normalize(item)]))
    }
    return value
  }
  return JSON.stringify(normalize(actual)) === JSON.stringify(normalize(expected))
}
