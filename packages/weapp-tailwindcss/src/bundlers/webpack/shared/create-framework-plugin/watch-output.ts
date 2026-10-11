import type { Compiler } from 'webpack'
import path from 'node:path'
import micromatch from 'micromatch'
import { pluginName } from '@/constants'
import { createDebug } from '@/debug'
import { resolvePackageDir } from '@/utils/resolve-package'

export const debug = createDebug()
export const weappTailwindcssPackageDir = resolvePackageDir('weapp-tailwindcss')

// Webpack 的配置类型省略了 Watchpack 在运行时支持的函数 matcher。
type WebpackWatchOptions = Omit<NonNullable<Parameters<Compiler['watch']>[0]>, 'ignored'> & {
  ignored?: string | RegExp | string[] | OutputIgnoredPredicate
}
type WebpackWatchIgnoredItem = string | RegExp | ((file: string) => boolean)
const outputIgnoredPredicatePath = Symbol('weapp-tailwindcss.outputIgnoredPredicatePath')

type OutputIgnoredPredicate = ((file: string) => boolean) & {
  [outputIgnoredPredicatePath]?: string
}

export function shouldKeepPreviousWebpackCssSource(
  previous: { css: string | undefined, processed?: boolean | undefined },
  next: { css: string | undefined, processed?: boolean | undefined },
) {
  return next.processed === true && previous.processed === false
}

function normalizeIgnoredList(ignored: WebpackWatchOptions['ignored']): WebpackWatchIgnoredItem[] {
  const items: unknown[] = Array.isArray(ignored) ? [...ignored] : [ignored]
  return items.filter((item): item is WebpackWatchIgnoredItem =>
    (typeof item === 'string' && item.length > 0) || item instanceof RegExp || typeof item === 'function',
  )
}

function createOutputIgnoredPredicate(
  ignoredList: WebpackWatchIgnoredItem[],
  ignoredPath: string,
) {
  const paths = path.win32.isAbsolute(ignoredPath) && !path.posix.isAbsolute(ignoredPath) ? path.win32 : path
  const contains = (directory: string, file: string) => {
    const relative = paths.relative(directory, file)
    return relative === '' || (relative !== '..' && !relative.startsWith(`..${paths.sep}`) && !paths.isAbsolute(relative))
  }
  const predicate: OutputIgnoredPredicate = (file: string) => {
    const resolvedFile = paths.resolve(file)
    if (contains(ignoredPath, resolvedFile)) {
      return true
    }

    const normalizedFile = file.replace(/\\/g, '/')
    return ignoredList.some((item) => {
      if (typeof item === 'string') {
        const resolvedItem = paths.resolve(item)
        if (contains(resolvedItem, resolvedFile)) {
          return true
        }
        return micromatch.isMatch(normalizedFile, [item, `${item}/**`], { dot: true })
      }
      if (item instanceof RegExp) {
        return item.test(normalizedFile)
      }
      return item(file)
    })
  }
  predicate[outputIgnoredPredicatePath] = ignoredPath
  return predicate
}

function appendIgnoredPath(ignored: WebpackWatchOptions['ignored'], ignoredPath: string) {
  if (
    typeof ignored === 'function'
    && (ignored as OutputIgnoredPredicate)[outputIgnoredPredicatePath] === ignoredPath
  ) {
    return ignored
  }

  // Watchpack 将字符串解释成 glob，输出目录必须保留字面路径语义。
  return createOutputIgnoredPredicate(normalizeIgnoredList(ignored), ignoredPath)
}

export function setupWebpackWatchOutputIgnore(compiler: Compiler) {
  const compilerOptions = compiler.options as Omit<Compiler['options'], 'watchOptions'> & { watchOptions: WebpackWatchOptions }
  const appendOutputIgnoredPath = (watchOptions?: WebpackWatchOptions, outputPath?: string) => {
    const resolvedOutputPath = outputPath || compiler.outputPath || compiler.options?.output?.path
    const paths = resolvedOutputPath && path.win32.isAbsolute(resolvedOutputPath) && !path.posix.isAbsolute(resolvedOutputPath) ? path.win32 : path
    const outputDir = resolvedOutputPath ? paths.resolve(resolvedOutputPath) : undefined
    if (!outputDir) {
      return watchOptions
    }

    if (watchOptions && typeof watchOptions === 'object') {
      const nextIgnored = appendIgnoredPath(watchOptions.ignored, outputDir)
      if (nextIgnored === undefined) {
        delete watchOptions.ignored
      }
      else {
        watchOptions.ignored = nextIgnored
      }
      return watchOptions
    }

    return { ignored: appendIgnoredPath(undefined, outputDir) }
  }

  const compilerWatchOptions = appendOutputIgnoredPath(compilerOptions.watchOptions)
  if (compilerWatchOptions) {
    compilerOptions.watchOptions = compilerWatchOptions
  }

  const syncOutputIgnoredPath = () => {
    const outputPath = compiler.outputPath || compiler.options?.output?.path
    const watchOptions = (compiler.watching as { watchOptions?: WebpackWatchOptions } | undefined)?.watchOptions
    if (watchOptions) {
      appendOutputIgnoredPath(watchOptions, outputPath)
    }
  }

  compiler.hooks.watchRun?.tap(pluginName, syncOutputIgnoredPath)
  compiler.hooks.thisCompilation?.tap(pluginName, (compilation) => {
    const outputPath = compilation.compiler?.outputPath || compilation.outputOptions?.path
    const watchOptions = (compiler.watching as { watchOptions?: WebpackWatchOptions } | undefined)?.watchOptions
    if (watchOptions) {
      appendOutputIgnoredPath(watchOptions, outputPath)
    }
    else {
      const compilerWatchOptions = appendOutputIgnoredPath(compilerOptions.watchOptions, outputPath)
      if (compilerWatchOptions) {
        compilerOptions.watchOptions = compilerWatchOptions
      }
    }
  })
}
