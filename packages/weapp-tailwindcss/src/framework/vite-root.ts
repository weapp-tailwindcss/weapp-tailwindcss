import { existsSync } from 'node:fs'
import path from 'node:path'
import { detectAppType } from '@weapp-tailwindcss/env'

const PACKAGE_JSON_FILE = 'package.json'

export function resolveImplicitAppTypeFromViteRoot(root: string, options: { searchUp?: boolean } = {}) {
  const resolvedRoot = path.resolve(root)
  if (options.searchUp !== false) {
    return detectAppType({
      root: resolvedRoot,
      searchUp: options.searchUp,
    })
  }

  // Vite root 可能指向 package 内的 src；只向上找到最近 package boundary，避免继承 workspace 根框架。
  if (!existsSync(resolvedRoot)) {
    return
  }
  const localProfile = detectAppType({ root: resolvedRoot, searchUp: false })
  if (localProfile) {
    return localProfile
  }
  let current = resolvedRoot
  while (true) {
    if (existsSync(path.join(current, PACKAGE_JSON_FILE))) {
      if (current === resolvedRoot) {
        return
      }
      return detectAppType({ root: current, searchUp: false })
    }
    const parent = path.dirname(current)
    if (parent === current) {
      return
    }
    current = parent
  }
}
