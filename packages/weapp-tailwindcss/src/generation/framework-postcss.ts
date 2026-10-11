import type { AcceptedPlugin } from '@weapp-tailwindcss/postcss/transform'
import type { LoadedPostcssOptions } from '@weapp-tailwindcss/postcss/types'
import type { GenerateCssByGeneratorResult } from './index'
import type { GenerationStyleHandlerOptions as IStyleHandlerOptions } from './style-options'
import type { Compiler, CompilerSnapshot } from '@/core/compiler'
import type { InternalUserDefinedOptions } from '@/types'
import { processFrameworkCss, removeTailwindPostcssPlugins } from '@weapp-tailwindcss/postcss/transform'
import { composeGenerationArtifact, createCssFragment, createGenerationArtifact, createStylePlatformAdapter } from '@/compiler'
import { finalizeMiniProgramGeneratorCss } from './generation-helpers'

const FRAMEWORK_POSTCSS_REGISTRY = Symbol.for('weapp-tailwindcss.framework-postcss-options')
const registryHost = globalThis as typeof globalThis & Record<symbol, unknown>
const frameworkPostcssOptions = (
  registryHost[FRAMEWORK_POSTCSS_REGISTRY]
    ??= new WeakMap<object, LoadedPostcssOptions>()
) as WeakMap<object, LoadedPostcssOptions>

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function normalizePlugins(plugins: unknown): AcceptedPlugin[] {
  const entries = Array.isArray(plugins)
    ? plugins
    : isObject(plugins)
      ? Object.values(plugins)
      : []
  const resolved = [...new Set(entries.filter(Boolean))] as AcceptedPlugin[]
  removeTailwindPostcssPlugins(resolved)
  return resolved
}

export function resolveFrameworkPostcssOptions(value: unknown): LoadedPostcssOptions | undefined {
  if (!isObject(value)) {
    return undefined
  }
  const plugins = normalizePlugins(value['plugins'])
  const options = Object.fromEntries(
    Object.entries(value).filter(([key]) => key !== 'plugins' && key !== 'config'),
  )
  if (plugins.length === 0 && Object.keys(options).length === 0) {
    return undefined
  }
  return {
    plugins: plugins as NonNullable<LoadedPostcssOptions['plugins']>,
    options,
  }
}

function mergeFrameworkPostcssOptions(
  left: LoadedPostcssOptions | undefined,
  right: LoadedPostcssOptions | undefined,
): LoadedPostcssOptions | undefined {
  if (!left) {
    return right
  }
  if (!right) {
    return left
  }
  return {
    plugins: [...new Set([
      ...normalizePlugins(left.plugins),
      ...normalizePlugins(right.plugins),
    ])] as NonNullable<LoadedPostcssOptions['plugins']>,
    options: {
      ...(left.options ?? {}),
      ...(right.options ?? {}),
    },
  }
}

export function collectFrameworkPostcssOptionsFromLoaderEntries(
  entries: unknown[],
  loaderContext?: unknown,
): LoadedPostcssOptions | undefined {
  let resolved: LoadedPostcssOptions | undefined
  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(visit)
      return
    }
    if (!isObject(value)) {
      return
    }
    const loader = value['loader']
    if (typeof loader === 'string' && loader.includes('postcss-loader')) {
      const loaderOptions = value['options']
      const rawOptions = isObject(loaderOptions) ? loaderOptions['postcssOptions'] : undefined
      const options = typeof rawOptions === 'function'
        ? rawOptions(loaderContext)
        : rawOptions
      resolved = mergeFrameworkPostcssOptions(resolved, resolveFrameworkPostcssOptions(options))
      return
    }
    visit(value['rules'])
    visit(value['oneOf'])
    visit(value['use'])
  }
  entries.forEach(visit)
  return resolved
}

export function captureFrameworkPostcssOptions(
  owner: InternalUserDefinedOptions,
  options: unknown,
): LoadedPostcssOptions | undefined {
  const resolved = resolveFrameworkPostcssOptions(options)
  if (!resolved) {
    frameworkPostcssOptions.delete(owner)
    return undefined
  }
  frameworkPostcssOptions.set(owner, resolved)
  return resolved
}

export function captureResolvedFrameworkPostcssOptions(
  owner: InternalUserDefinedOptions,
  options: LoadedPostcssOptions | undefined,
): LoadedPostcssOptions | undefined {
  if (!options) {
    frameworkPostcssOptions.delete(owner)
    return undefined
  }
  frameworkPostcssOptions.set(owner, options)
  return options
}

export function hasFrameworkPostcssOptions(owner: InternalUserDefinedOptions): boolean {
  return frameworkPostcssOptions.has(owner)
}

function createGeneratedCssHandlerOptions(
  owner: InternalUserDefinedOptions,
  options: IStyleHandlerOptions,
  from: string,
): IStyleHandlerOptions {
  const frameworkOptions = frameworkPostcssOptions.get(owner)
  const merged = mergeFrameworkPostcssOptions(options.postcssOptions, frameworkOptions)
  return {
    ...options,
    postcssOptions: {
      ...(merged ?? {}),
      options: {
        ...(merged?.options ?? {}),
        from,
      },
    },
  }
}

function createFrameworkReplayArtifact(
  generated: GenerateCssByGeneratorResult,
  options: {
    cssHandlerOptions: IStyleHandlerOptions
    file: string
    rawCandidates: Iterable<string>
  },
) {
  const sourceId = generated.metadata?.file ?? options.file
  const scope = {
    id: generated.metadata?.outputFile ?? sourceId,
    kind: options.cssHandlerOptions.isMainChunk ? 'global' as const : 'component' as const,
  }
  return createGenerationArtifact([
    createCssFragment({
      id: `${scope.id}:framework-replay`,
      kind: 'tailwind',
      css: generated.css,
      sourceId,
      scope,
      stage: 'raw',
    }),
  ], {
    classSet: new Set(generated.classSet),
    rawCandidates: new Set(options.rawCandidates),
    dependencies: generated.dependencies,
    sourceEntries: options.cssHandlerOptions.sourceOptions?.cssEntries ?? [],
    ...(generated.metadata?.revision === undefined ? {} : { revision: generated.metadata.revision }),
  })
}

export async function adaptGeneratedCssWithFrameworkPipeline(
  owner: InternalUserDefinedOptions,
  generated: GenerateCssByGeneratorResult,
  options: {
    cssHandlerOptions: IStyleHandlerOptions
    file: string
    majorVersion: number
    styleHandler: InternalUserDefinedOptions['styleHandler']
  },
): Promise<string> {
  const handlerOptions = createGeneratedCssHandlerOptions(owner, options.cssHandlerOptions, options.file)
  if (generated.target === 'web') {
    return (await processFrameworkCss(generated.css, handlerOptions.postcssOptions!)).css
  }
  const handled = await options.styleHandler(generated.css, handlerOptions)
  const preflightMode = generated.metadata?.preflightMode
  const injectPreflight = preflightMode?.inject ?? options.cssHandlerOptions.isMainChunk
  const preservePreflight = preflightMode?.preserve ?? options.cssHandlerOptions.isMainChunk
  return finalizeMiniProgramGeneratorCss(
    handled.css,
    generated.target,
    options.majorVersion,
    owner.cssPreflight,
    {
      ...(injectPreflight === undefined ? {} : { injectPreflight }),
      ...(preservePreflight === undefined ? {} : { preservePreflight }),
      styleOptions: options.cssHandlerOptions,
    },
  )
}

export async function adaptGeneratedCssWithFrameworkRootPipeline(
  owner: InternalUserDefinedOptions,
  generated: GenerateCssByGeneratorResult,
  options: {
    cssHandlerOptions: IStyleHandlerOptions
    file: string
    majorVersion: number
    rawCandidates: Iterable<string>
    styleHandler: InternalUserDefinedOptions['styleHandler']
    compiler?: Compiler | undefined
    snapshot?: CompilerSnapshot | undefined
  },
): Promise<string> {
  const handlerOptions = createGeneratedCssHandlerOptions(owner, options.cssHandlerOptions, options.file)
  if (generated.target === 'web') {
    return (await processFrameworkCss(generated.css, handlerOptions.postcssOptions!)).css
  }
  const replayArtifact = createFrameworkReplayArtifact(generated, options)
  const handled = options.compiler && options.snapshot
    ? composeGenerationArtifact(await (async () => {
        for (const fragment of replayArtifact.fragments) {
          const result = await options.compiler!.transformCssRoot(fragment.root, options.snapshot!, handlerOptions)
          fragment.root = result.root.clone()
          fragment.stage = 'framework-processed'
        }
        return replayArtifact
      })())
    : typeof options.styleHandler.transformRoot === 'function'
      ? composeGenerationArtifact(await createStylePlatformAdapter({
          id: generated.target === 'web' ? 'web' : 'mini-program',
          styleHandler: options.styleHandler,
          styleOptions: handlerOptions,
        }).transform(replayArtifact, { stage: 'framework-processed' }))
      : await options.styleHandler(generated.css, handlerOptions)
  const preflightMode = generated.metadata?.preflightMode
  const injectPreflight = preflightMode?.inject ?? options.cssHandlerOptions.isMainChunk
  const preservePreflight = preflightMode?.preserve ?? options.cssHandlerOptions.isMainChunk
  return finalizeMiniProgramGeneratorCss(
    handled.css,
    generated.target,
    options.majorVersion,
    owner.cssPreflight,
    {
      ...(injectPreflight === undefined ? {} : { injectPreflight }),
      ...(preservePreflight === undefined ? {} : { preservePreflight }),
      styleOptions: options.cssHandlerOptions,
    },
  )
}
