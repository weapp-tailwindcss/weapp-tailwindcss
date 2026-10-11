import type webpack from 'webpack'
import type { RuntimeLoaderWatchDependencies, WebpackRuntimeClassSetLoaderOptions } from './runtime-registry'
import { Buffer } from 'node:buffer'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { normalizeTailwindV4RuntimeCss } from '@weapp-tailwindcss/postcss/transform'
import { isWebpackCssLoaderRuntimeSource } from '../shared/css-loader-runtime'
import { getWebpackLoaderRuntime } from './runtime-registry'
import { registerWebpackWatchContext, registerWebpackWatchFile } from './watch-dependencies'

interface RuntimeClassSetLoaderOptions extends WebpackRuntimeClassSetLoaderOptions {
  weappTailwindcssRuntimeKey?: string
}

function isPromiseLike<T>(value: unknown): value is PromiseLike<T> {
  return Boolean(value && typeof (value as PromiseLike<T>).then === 'function')
}

function normalizeRuntimeCssSource(source: string | Buffer) {
  if (Buffer.isBuffer(source)) {
    const css = source.toString('utf8')
    return shouldCleanRuntimeCss(css) ? Buffer.from(normalizeTailwindV4RuntimeCss(css)) : source
  }
  return shouldCleanRuntimeCss(source) ? normalizeTailwindV4RuntimeCss(source) : source
}

function shouldCleanRuntimeCss(css: string) {
  return !isWebpackCssLoaderRuntimeSource(css) && (css.includes('@layer') || css.includes('@theme'))
}

function resolveOriginalCssSource(file: string, source: string | Buffer) {
  if (isPlainCssResource(file)) {
    try {
      return readFileSync(file, 'utf8')
    }
    catch {
    }
  }
  return Buffer.isBuffer(source) ? source.toString('utf8') : source
}

function resolveRegisteredCssSource(file: string, source: string | Buffer) {
  const sourceText = Buffer.isBuffer(source) ? source.toString('utf8') : source
  if (!isWebpackCssLoaderRuntimeSource(sourceText)) {
    return resolveOriginalCssSource(file, source)
  }
  if (isPlainCssResource(file)) {
    try {
      return readFileSync(file, 'utf8')
    }
    catch {
      return undefined
    }
  }
  return undefined
}

function isPlainCssResource(file: string) {
  return new Set([
    '.acss',
    '.css',
    '.jxss',
    '.qss',
    '.ttss',
    '.wxss',
  ]).has(path.extname(file.replace(/[?#].*$/, '')).toLowerCase())
}

const WeappTwRuntimeClassSetLoader: webpack.LoaderDefinitionFunction<RuntimeClassSetLoaderOptions> = function (
  this: webpack.LoaderContext<RuntimeClassSetLoaderOptions>,
  source: string | Buffer,
) {
  if (process.env['WEAPP_TW_LOADER_DEBUG']) {
    process.stdout.write(`[weapp-tw-runtime-classset-loader] executing for ${this.resourcePath}\n`)
  }
  const rawOptions = this.getOptions()
  const runtime = getWebpackLoaderRuntime(rawOptions?.weappTailwindcssRuntimeKey)
  const opt = runtime?.classSet ?? rawOptions
  if (this.resourcePath) {
    const sourceText = Buffer.isBuffer(source) ? source.toString('utf8') : source
    if (!isWebpackCssLoaderRuntimeSource(sourceText)) {
      opt?.updateGeneratedCss?.({
        file: this.resourcePath,
        css: sourceText,
      })
    }
    opt?.registerCssSourceFile?.({
      file: this.resourcePath,
      css: resolveRegisteredCssSource(this.resourcePath, source),
    })
  }
  const maybePromise = opt?.getClassSet?.()
  const applyWatchDependencies = (dependencies: RuntimeLoaderWatchDependencies | void) => {
    const pending: Promise<void>[] = []
    for (const file of dependencies?.files ?? []) {
      const registration = registerWebpackWatchFile(this, file)
      if (registration) {
        pending.push(registration)
      }
    }
    for (const context of dependencies?.contexts ?? []) {
      registerWebpackWatchContext(this, context)
    }
    return pending.length ? Promise.all(pending).then(() => {}) : undefined
  }
  const resolveWatchDependencies = () => {
    const dependencies = opt?.getWatchDependencies?.()
    if (isPromiseLike<RuntimeLoaderWatchDependencies | void>(dependencies)) {
      return Promise.resolve(dependencies).then(applyWatchDependencies)
    }
    return applyWatchDependencies(dependencies)
  }
  if (isPromiseLike<void>(maybePromise)) {
    return Promise.resolve(maybePromise).then(async () => {
      await resolveWatchDependencies()
      return normalizeRuntimeCssSource(source)
    })
  }
  const watchDependencies = resolveWatchDependencies()
  if (watchDependencies) {
    return watchDependencies.then(() => normalizeRuntimeCssSource(source))
  }
  return normalizeRuntimeCssSource(source)
}

export default WeappTwRuntimeClassSetLoader
