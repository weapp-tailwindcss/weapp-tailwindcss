import type { Graph } from './graph'
import type { WorkspacePackage } from './workspace'
import { isBuiltin } from 'node:module'
import path from 'node:path'
import { findPath } from './graph'
import { inside, resolveWorkspaceEntry } from './workspace'

const clientEntries: Record<string, string[]> = {
  '@weapp-tailwindcss/runtime': [''],
  '@weapp-tailwindcss/cn': [''],
  '@weapp-tailwindcss/merge': ['', '/slim', '/lite'],
  '@weapp-tailwindcss/cva': [''],
  '@weapp-tailwindcss/variants': [''],
  'theme-transition': [''],
  '@weapp-tailwindcss/ui': ['/variants', '/components', '/utils', '/hooks', '/adapters'],
  'weapp-tailwindcss': ['/escape'],
}

/** 客户端只约束值依赖；主题插件、typography 与 UI preset 属于构建入口。 */
export function auditClientBoundaries(root: string, packages: WorkspacePackage[], values: Graph) {
  const buildPackages = ['engine', 'source-scan', 'css-compat', 'postcss', 'cli', 'tailwindcss-config', 'weapp-style-injector']
    .map(name => path.join(root, 'packages', name, 'src'))
  const forbidden = (file: string) => {
    if (buildPackages.some(directory => inside(directory, file))) {
      return true
    }
    if (!file.startsWith('external:')) {
      return false
    }
    const specifier = file.slice('external:'.length)
    return isBuiltin(specifier)
      || /^(?:vite|webpack|rollup|rspack|@rspack\/core|vinyl|fast-glob|esbuild|tailwindcss|@tailwindcss\/(?:node|oxide))(?:$|\/)/.test(specifier)
  }
  const errors: string[] = []
  for (const pkg of packages) {
    for (const suffix of clientEntries[pkg.name] ?? []) {
      const exports = pkg.exports as Record<string, unknown> | undefined
      if (exports && typeof exports === 'object' && Object.keys(exports).some(key => key.startsWith('.')) && !Object.hasOwn(exports, suffix ? `.${suffix}` : '.')) {
        continue
      }
      const entry = resolveWorkspaceEntry(pkg, `${pkg.name}${suffix}`)
      if (!entry) {
        errors.push(`无法解析客户端入口：${pkg.name}${suffix}`)
        continue
      }
      const chain = findPath(values, entry, forbidden)
      if (chain) {
        errors.push(`客户端引入构建依赖：${chain.map(file => file.startsWith('external:') ? file : path.relative(root, file)).join(' -> ')}`)
      }
    }
  }
  return errors
}
