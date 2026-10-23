import type { Dirent } from 'node:fs'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

const IGNORED_WORKSPACE_DIRS = new Set([
  'node_modules',
  '.git',
  '.hg',
  '.svn',
  '.turbo',
  '.output',
  '.next',
  'dist',
  'build',
])

export function findWorkspaceRoot(startDir: string | undefined) {
  if (!startDir) {
    return undefined
  }

  let current = path.resolve(startDir)
  while (true) {
    const workspaceFile = path.join(current, 'pnpm-workspace.yaml')
    if (existsSync(workspaceFile)) {
      return current
    }
    const parent = path.dirname(current)
    if (parent === current) {
      return undefined
    }
    current = parent
  }
}

export { findNearestPackageRoot } from '@/utils/package-root'

export function findWorkspacePackageDir(rootDir: string, packageName: string) {
  const visited = new Set<string>()
  const queue = [path.resolve(rootDir)]

  while (queue.length > 0) {
    const current = queue.shift()!
    const normalized = path.normalize(current)
    if (visited.has(normalized)) {
      continue
    }
    visited.add(normalized)

    try {
      const pkgPath = path.join(normalized, 'package.json')
      if (existsSync(pkgPath)) {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { name?: string }
        if (pkg?.name === packageName) {
          return normalized
        }
      }
    }
    catch {
      // 忽略读取 package.json 的异常，继续向下遍历
    }

    let entries: Dirent[]
    try {
      entries = readdirSync(normalized, { withFileTypes: true })
    }
    catch {
      continue
    }

    for (const entry of entries) {
      if (!entry.isDirectory() || IGNORED_WORKSPACE_DIRS.has(entry.name) || entry.isSymbolicLink?.()) {
        continue
      }
      queue.push(path.join(normalized, entry.name))
    }
  }

  return undefined
}
