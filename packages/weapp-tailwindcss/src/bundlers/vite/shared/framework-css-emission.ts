import type { EmittedAsset, EmittedFile, ObjectHook, OutputAsset, OutputBundle, PluginContext, TransformResult } from 'rollup'
import type { Plugin, ResolvedConfig } from 'vite'
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { stripBundlerGeneratedCssMarkers } from '../../shared/generated-css-marker'

type CssTransform = (css: string, file: EmittedFile) => string
type RenderChunk = Extract<Plugin['renderChunk'], (...args: never[]) => unknown>
type GenerateBundle = Extract<Plugin['generateBundle'], (...args: never[]) => unknown>
type Transform = Extract<Plugin['transform'], (...args: never[]) => unknown>
type CssAssetWithSource = EmittedAsset & { source: string | Uint8Array }

interface CssEmissionState {
  transformCss: CssTransform
  rehashCssAsset?: ((file: EmittedFile) => boolean) | undefined
  trackFrameworkAssets: boolean
  frameworkAssets: Array<{ fileName?: string | undefined, referenceId?: string | undefined, source: string }>
  getFileName?: (referenceId: string) => string
}

const wrappedPlugins = new WeakMap<Plugin, CssEmissionState>()
const configStates = new WeakMap<ResolvedConfig, Set<CssEmissionState>>()

function unwrap<T>(hook: ObjectHook<T> | undefined): T | undefined {
  return hook && typeof hook === 'object' && 'handler' in hook ? hook.handler : hook as T | undefined
}

function replace<T>(hook: ObjectHook<T> | undefined, handler: T): ObjectHook<T> {
  return hook && typeof hook === 'object' && 'handler' in hook ? { ...hook, handler } : handler
}

function isCssAsset(file: EmittedFile): file is CssAssetWithSource {
  return file.type === 'asset'
    && file.source !== undefined
    && [file.name, file.fileName, file.originalFileName].some(name => name?.endsWith('.css'))
}

/** Vite 的 css-post 在计算内容 hash 前会以匿名 asset 发射合并 CSS。 */
function isAnonymousCssAsset(file: EmittedFile, state: CssEmissionState): file is CssAssetWithSource {
  return state.trackFrameworkAssets
    && file.type === 'asset'
    && file.source !== undefined
    && file.name === undefined
    && file.fileName === undefined
    && file.originalFileName === undefined
}

function transformCssAsset(file: EmittedFile, state: CssEmissionState): EmittedFile {
  if (!isCssAsset(file) && !isAnonymousCssAsset(file, state)) {
    return file
  }
  const source = typeof file.source === 'string' ? file.source : Buffer.from(file.source).toString('utf8')
  const css = state.transformCss(source, file)
  if (state.trackFrameworkAssets) {
    state.frameworkAssets.push({ fileName: file.fileName, source: css })
  }
  if (css === source) {
    return file
  }
  const emitted = {
    ...file,
    source: typeof file.source === 'string' ? css : Buffer.from(css),
  }
  if (!state.trackFrameworkAssets && state.rehashCssAsset?.(file) && file.fileName) {
    return {
      ...emitted,
      fileName: file.fileName.replace(/\.css$/i, `-${createHash('sha256').update(css).digest('hex').slice(0, 8)}.css`),
    }
  }
  return emitted
}

function withCssEmission(context: PluginContext, state: CssEmissionState) {
  if (typeof context.getFileName === 'function') {
    state.getFileName = context.getFileName.bind(context)
  }
  return new Proxy(context, {
    get(target, property, receiver) {
      if (property === 'emitFile') {
        return ((file) => {
          const before = state.frameworkAssets.length
          const referenceId = target.emitFile(transformCssAsset(file, state))
          const candidate = state.frameworkAssets.length > before ? state.frameworkAssets[before] : undefined
          if (candidate) {
            candidate.referenceId = referenceId
          }
          return referenceId
        }) as typeof target.emitFile
      }
      return Reflect.get(target, property, receiver)
    },
  })
}

function transformCssResult(result: TransformResult, transformCss: CssTransform): TransformResult {
  if (typeof result === 'string') {
    return transformCss(result, { type: 'asset', source: result })
  }
  if (result && typeof result === 'object' && 'code' in result && typeof result.code === 'string') {
    return { ...result, code: transformCss(result.code, { type: 'asset', source: result.code }) }
  }
  return result
}

/**
 * 在 Vite 发射已合并 CSS 时完成框架修正。
 * 必须早于 emitFile/getFileName，才能让内容 hash、HTML 和分包引用由 bundler 同步生成。
 */
export function installFrameworkCssEmission(config: ResolvedConfig, transformCss: CssTransform, rehashCssAsset?: (file: EmittedFile) => boolean) {
  if (config.command !== 'build') {
    return false
  }
  const plugins = (config.plugins ?? []).filter(candidate => candidate.name === 'vite:css-post' || candidate.name === 'uni:h5-css')
  if (!plugins.length) {
    return false
  }
  let installed = false
  let states = configStates.get(config)
  if (!states) {
    states = new Set<CssEmissionState>()
    configStates.set(config, states)
  }
  for (const plugin of plugins) {
    const trackFrameworkAssets = plugin.name === 'vite:css-post' || plugin.name === 'uni:h5-css'
    const existing = wrappedPlugins.get(plugin)
    if (existing) {
      existing.transformCss = transformCss
      existing.rehashCssAsset = rehashCssAsset
      existing.trackFrameworkAssets = trackFrameworkAssets
      states.add(existing)
      installed = true
      continue
    }
    const renderChunk = unwrap<RenderChunk>(plugin.renderChunk)
    const generateBundle = unwrap<GenerateBundle>(plugin.generateBundle)
    const transform = unwrap<Transform>(plugin.transform)
    if (!renderChunk && !generateBundle) {
      continue
    }
    const state: CssEmissionState = {
      transformCss,
      rehashCssAsset,
      trackFrameworkAssets,
      frameworkAssets: [],
    }
    if (renderChunk) {
      plugin.renderChunk = replace(plugin.renderChunk, function (...args) {
        return renderChunk.apply(withCssEmission(this, state), args)
      })
    }
    if (generateBundle) {
      plugin.generateBundle = replace(plugin.generateBundle, function (...args) {
        return generateBundle.apply(withCssEmission(this, state), args)
      })
    }
    if (transform) {
      plugin.transform = replace(plugin.transform, async function (...args) {
        return transformCssResult(await transform.apply(this, args), state.transformCss)
      })
    }
    wrappedPlugins.set(plugin, state)
    states.add(state)
    installed = true
  }
  return installed
}

function sourceText(source: OutputAsset['source']) {
  return typeof source === 'string' ? source : Buffer.from(source).toString('utf8')
}

function resolveFrameworkCssFileName(fileName: string, source: string) {
  const fullHash = createHash('sha256').update(stripBundlerGeneratedCssMarkers(source)).digest('hex')
  const extension = fileName.match(/\.css$/i)?.[0] ?? ''
  const stem = extension ? fileName.slice(0, -extension.length) : fileName
  const lastSegment = stem.match(/(?:^|[-_.])([a-z0-9]{8,})$/i)
  const lastHash = lastSegment?.[1]
  if (lastSegment && lastHash) {
    // 保持 bundler 已选择的 hash 长度，避免自定义 assetFileNames 的命名契约被最终化破坏。
    const hash = fullHash.slice(0, lastHash.length)
    const start = lastSegment.index! + lastSegment[0].length - lastHash.length
    return stem.slice(0, start) + hash + extension
  }
  const hash = fullHash.slice(0, 8)
  return `${stem}-${hash}${extension}`
}

function replaceBundleReferences(bundle: OutputBundle, previous: string, next: string) {
  for (const output of Object.values(bundle)) {
    if (output.type === 'chunk') {
      output.code = output.code.split(previous).join(next)
      const metadata = output.viteMetadata as { importedCss?: Set<string> | string[] } | undefined
      const importedCss = metadata?.importedCss
      if (importedCss) {
        if (importedCss instanceof Set) {
          if (importedCss.delete(previous)) {
            importedCss.add(next)
          }
        }
        else {
          metadata!.importedCss = importedCss.map(file => file === previous ? next : file)
        }
      }
      continue
    }
    if (typeof output.source === 'string') {
      output.source = output.source.split(previous).join(next)
    }
    else if (output.source instanceof Uint8Array) {
      const source = Buffer.from(output.source).toString('utf8')
      const replaced = source.split(previous).join(next)
      if (replaced !== source) {
        output.source = Buffer.from(replaced)
      }
    }
  }
}

/**
 * 在所有 generateBundle 阶段完成后，重新计算框架 CSS 资产身份并同步 bundle 引用。
 */
export function finalizeFrameworkCssEmission(config: ResolvedConfig | undefined, bundle: OutputBundle) {
  if (!config) {
    return
  }
  const states = configStates.get(config)
  if (!states) {
    return
  }
  for (const state of states) {
    if (!state.trackFrameworkAssets) {
      continue
    }
    const claimed = new Set<OutputAsset>()
    const htmlSources = Object.values(bundle)
      .filter((entry): entry is OutputAsset => entry.type === 'asset' && entry.fileName.endsWith('.html'))
      .map(entry => sourceText(entry.source))
    for (const candidate of state.frameworkAssets) {
      if (!candidate.fileName && candidate.referenceId && state.getFileName) {
        try {
          candidate.fileName = state.getFileName(candidate.referenceId)
        }
        catch {
          candidate.fileName = undefined
        }
      }
      let output = candidate.fileName ? bundle[candidate.fileName] : undefined
      if (!output) {
        output = Object.values(bundle).find((entry): entry is OutputAsset => entry.type === 'asset'
          && entry.fileName.endsWith('.css')
          && !claimed.has(entry)
          && sourceText(entry.source).includes(candidate.source))
      }
      if (!output || output.type !== 'asset' || !output.fileName.endsWith('.css')) {
        continue
      }
      claimed.add(output)
      const source = sourceText(output.source)
      if (!htmlSources.some(html => html.includes(output!.fileName))) {
        continue
      }
      const previous = output.fileName
      const next = resolveFrameworkCssFileName(previous, source)
      if (next === previous) {
        continue
      }
      const renamed = { ...output, fileName: next }
      delete bundle[previous]
      bundle[next] = renamed
      replaceBundleReferences(bundle, previous, next)
    }
    state.frameworkAssets = []
  }
}

/**
 * 在所有框架与 weapp-tailwindcss 的 CSS finalizer 之后同步资源身份。
 */
export function createFrameworkCssEmissionFinalizerPlugin(getResolvedConfig: () => ResolvedConfig | undefined): Plugin {
  return {
    name: 'weapp-tailwindcss:framework-css-emission-finalizer',
    enforce: 'post',
    generateBundle: {
      order: 'post',
      handler(_options, bundle) {
        finalizeFrameworkCssEmission(getResolvedConfig(), bundle)
      },
    },
  }
}
