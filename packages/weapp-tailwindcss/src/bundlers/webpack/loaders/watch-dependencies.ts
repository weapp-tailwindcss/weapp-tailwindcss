import type { TailwindSourceEntry } from '@weapp-tailwindcss/source-scan'
import type { Compiler } from 'webpack'
import { statSync } from 'node:fs'
import path from 'node:path'
import { expandSourceEntryBraces, resolveSourceScanPath, resolveTailwindSourceEntry } from '@weapp-tailwindcss/source-scan'

interface WebpackWatchDependencyLoaderContext {
  fs?: Pick<NonNullable<Compiler['inputFileSystem']>, 'stat'>
  addDependency?: (file: string) => void
  addMissingDependency?: (file: string) => void
  addContextDependency?: (context: string) => void
}

function normalizeWebpackWatchPath(file: string) {
  return path.resolve(file)
}

export function registerWebpackWatchFile(
  loaderContext: WebpackWatchDependencyLoaderContext,
  file: string,
) {
  const resolved = normalizeWebpackWatchPath(file)
  const register = (error?: NodeJS.ErrnoException | null, stats?: { isDirectory: () => boolean }) => {
    if (stats?.isDirectory()) {
      loaderContext.addContextDependency?.(resolved)
    }
    else if (error && ['ENOENT', 'ENOTDIR'].includes(error.code ?? '') && loaderContext.addMissingDependency) {
      loaderContext.addMissingDependency(resolved)
    }
    else {
      loaderContext.addDependency?.(resolved)
    }
  }
  // 虚拟模块仅存在于构建器输入文件系统，不能用磁盘状态判定为缺失。
  if (loaderContext.fs?.stat) {
    return new Promise<void>((resolve) => {
      loaderContext.fs!.stat(resolved, (error, stats) => {
        register(error, stats)
        resolve()
      })
    })
  }
  try {
    register(null, statSync(resolved))
  }
  catch (error) {
    register(error as NodeJS.ErrnoException)
  }
}

export function registerWebpackWatchContext(
  loaderContext: WebpackWatchDependencyLoaderContext,
  context: string,
) {
  loaderContext.addContextDependency?.(normalizeWebpackWatchPath(context))
}

export async function registerWebpackSourceContexts(
  loaderContext: WebpackWatchDependencyLoaderContext,
  options: { entries: TailwindSourceEntry[], explicit: boolean, root: string },
) {
  // 按静态 glob 前缀监听，避免配置 base 把 node_modules 和产物目录纳入递归快照。
  const entries = await Promise.all(expandSourceEntryBraces(options.entries.filter(entry => !entry.negated))
    .map(entry => resolveTailwindSourceEntry(entry.pattern, entry.base, false)))
  const roots = new Set(entries.map(entry => entry.base))
  if (!options.explicit && roots.size === 0) {
    roots.add(options.root)
  }
  for (const root of roots) {
    await registerWebpackWatchFile(loaderContext, resolveSourceScanPath(root))
  }
}
