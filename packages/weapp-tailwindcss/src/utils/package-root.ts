import { existsSync } from 'node:fs'
import path from 'node:path'

export function findNearestPackageRoot(startDir?: string) {
  if (!startDir) {
    return undefined
  }

  let current = path.resolve(startDir)
  while (true) {
    const pkgPath = path.join(current, 'package.json')
    if (existsSync(pkgPath)) {
      return current
    }
    const parent = path.dirname(current)
    if (parent === current) {
      return undefined
    }
    current = parent
  }
}
