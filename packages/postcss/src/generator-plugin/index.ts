import type { PluginCreator, Root } from 'postcss'
import type { IStyleHandlerOptions } from '../types'
import type { WeappTailwindcssPostcssPluginAdapters, WeappTailwindcssPostcssPluginOptions } from './types'
import { transformLynxCssCompat } from '../compat/lynx-css'
import { finalizeMiniProgramCss } from '../compat/mini-program-css'
import { transformWebCssCompat } from '../compat/web-css'
import { createSourceScanPattern, DEFAULT_SOURCE_SCAN_EXTENSIONS, resolveCssSourceEntries } from '../source-scan'
import { collectApplyOnlyCssSelectorsRoot, filterApplyOnlyGeneratedCss } from './apply-only'
import { prependConfigDirective } from './config-directive'
import { addDependencyMessages, addSourceDependencyMessages, replaceRootCss, resolvePostcssBase, resolvePostcssProjectRoot } from './context'
import { hasTailwindApplyDirective, hasTailwindRootDirectives } from './directives'
import { collectAutoTailwindCandidates, collectPostcssLocalSources } from './source-files'

const PLUGIN_NAME = 'weapp-tailwindcss'
const POSTCSS_SOURCE_PATTERN = createSourceScanPattern(DEFAULT_SOURCE_SCAN_EXTENSIONS)

function isTailwindV4ApplyOnlyCss(css: string, root: Root) {
  return hasTailwindApplyDirective(css)
    && !hasTailwindRootDirectives(root, { importFallback: true })
}

function resolveTailwindV4PostcssSourceCss(css: string, sourceOptions: Pick<WeappTailwindcssPostcssPluginOptions, 'packageName'>, root: Root) {
  const packageName = sourceOptions.packageName ?? 'tailwindcss'
  return isTailwindV4ApplyOnlyCss(css, root)
    ? `@import "${packageName}" source(none);\n@reference "${packageName}";\n${css}`
    : css
}

function isMiniProgramGeneratorTarget(target: string) {
  return target !== 'web'
}

function finalizeGeneratedCss(
  css: string,
  target: string,
  styleOptions: Partial<IStyleHandlerOptions> | undefined,
  webCompat: ReturnType<WeappTailwindcssPostcssPluginAdapters['normalizeGeneratorOptions']>['webCompat'],
) {
  if (target === 'web') {
    const webCss = transformWebCssCompat(css, webCompat)
    const platform = styleOptions?.cssOptions?.platform ?? styleOptions?.platform
    return platform === 'lynx' ? transformLynxCssCompat(webCss) : webCss
  }
  if (!isMiniProgramGeneratorTarget(target)) {
    return css
  }
  return finalizeMiniProgramCss(css, {
    cssSelectorReplacement: styleOptions?.cssOptions?.cssSelectorReplacement
      ?? styleOptions?.cssSelectorReplacement,
    isTailwindcssV4: true,
    tailwindcssV4GradientFallback: styleOptions?.cssOptions?.tailwindcssV4GradientFallback
      ?? styleOptions?.tailwindcssV4GradientFallback,
  })
}

export function createWeappTailwindcssPostcssPlugin(
  adapters: WeappTailwindcssPostcssPluginAdapters,
): PluginCreator<WeappTailwindcssPostcssPluginOptions> {
  const plugin: PluginCreator<WeappTailwindcssPostcssPluginOptions> = (options = {}) => {
    return {
      postcssPlugin: PLUGIN_NAME,
      async Once(root, { result }) {
        const {
          candidates,
          generator: userGeneratorOptions,
          scanSources,
          sources,
          styleOptions,
          ...sourceOptions
        } = options
        const generatorOptions = adapters.normalizeGeneratorOptions(userGeneratorOptions)
        const rawCss = sourceOptions.css ?? root.toString()
        const base = resolvePostcssBase(result, options)
        const projectRoot = resolvePostcssProjectRoot(result, options)
        const compiledScan = adapters.compiledSourceScan && scanSources !== false
        const sourceEntries = compiledScan ? [] : await resolveCssSourceEntries(root, base, POSTCSS_SOURCE_PATTERN)

        const [collectedSources, autoCandidates] = await Promise.all([
          compiledScan ? { files: [], sources: [] } : collectPostcssLocalSources(root, result, options, { sourceEntries }),
          compiledScan ? new Set<string>() : collectAutoTailwindCandidates(root, result, options, { css: rawCss, sourceEntries }),
        ])
        const generatorConfig = generatorOptions.config ?? options.config
        const isApplyOnlyTailwindV4Css = isTailwindV4ApplyOnlyCss(rawCss, root)
        const applyOnlyCssSelectors = isApplyOnlyTailwindV4Css
          ? collectApplyOnlyCssSelectorsRoot(root)
          : undefined
        const source = await adapters.resolveTailwindV4Source({
          ...sourceOptions,
          css: prependConfigDirective(
            resolveTailwindV4PostcssSourceCss(rawCss, sourceOptions, root),
            generatorConfig,
          ),
          base,
          projectRoot,
        })
        const generator = adapters.createGenerator(source)
        const generatorStyleOptions = {
          ...generatorOptions.styleOptions,
          ...styleOptions,
        }
        try {
          const generated = await generator.generate({
            candidates: new Set([
              ...autoCandidates,
              ...(candidates ?? []),
            ]),
            scanSources: compiledScan ? true : scanSources ?? false,
            ...(compiledScan ? { scanMode: 'compiled' as const, excludeFiles: result.opts.to ? [result.opts.to] : [] } : {}),
            sources: [
              ...collectedSources.sources,
              ...(sources ?? []),
            ],
            styleOptions: generatorStyleOptions,
            target: generatorOptions.target,
          })
          const css = isApplyOnlyTailwindV4Css
            ? filterApplyOnlyGeneratedCss(generated.css, applyOnlyCssSelectors ?? new Set())
            : generated.css
          const finalCss = finalizeGeneratedCss(css, generated.target, generatorStyleOptions, generatorOptions.webCompat)

          replaceRootCss(root, finalCss, result)
          addDependencyMessages(result, generated)
          addSourceDependencyMessages(result, collectedSources.files)
          result.messages.push({
            type: 'weapp-tailwindcss:generated',
            plugin: PLUGIN_NAME,
            target: generated.target,
            classSet: generated.classSet,
            rawCss: generated.rawCss,
          })
        }
        finally {
          generator.dispose?.()
        }
      },
    }
  }

  plugin.postcss = true
  return plugin
}

export type {
  NormalizedWeappTailwindcssPostcssGeneratorOptions,
  TailwindCandidateSource,
  TailwindResolvedSource,
  TailwindV4SourceOptions,
  WeappTailwindcssPostcssGenerateOptions,
  WeappTailwindcssPostcssGenerateResult,
  WeappTailwindcssPostcssGenerator,
  WeappTailwindcssPostcssGeneratorUserOptions,
  WeappTailwindcssPostcssPluginAdapters,
  WeappTailwindcssPostcssPluginOptions,
  WeappTailwindcssPostcssTarget,
} from './types'
