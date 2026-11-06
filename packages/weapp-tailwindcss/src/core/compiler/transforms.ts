import type { StyleHandler } from '@weapp-tailwindcss/postcss/transform'
import type { Compiler, CompilerCssTransformOptions, CompilerSnapshot } from './types'
import type { CompilerTransformServices } from '@/compiler/transform-services'
import { finalizeMiniProgramCssRoot, resolveSkylineTypographyCompatibility, stripTailwindBannerComments } from '@weapp-tailwindcss/postcss/transform'
import { getInternalCompilerSnapshot } from './snapshot'

const DEFAULT_JS_OPTIONS = Object.freeze({ tailwindcssMajorVersion: 4 as const })
const DEFAULT_STYLE_OPTIONS = Object.freeze({ isMainChunk: true as const })

function clonePostcssResult<Result extends Awaited<ReturnType<StyleHandler>>>(result: Result): Result {
  return Object.assign(Object.create(Object.getPrototypeOf(result)), result, {
    messages: [...result.messages],
    root: result.root.clone(),
  }) as Result
}

function resolveStyleOptions(options?: Parameters<StyleHandler>[1]): NonNullable<Parameters<StyleHandler>[1]> {
  if (!options) {
    return DEFAULT_STYLE_OPTIONS
  }
  return options?.isMainChunk === undefined
    ? { ...options, isMainChunk: true }
    : options
}

function resolveCssTransformOptions(options: CompilerCssTransformOptions | undefined, baseProperties: readonly string[] | undefined, baseSkyline: boolean | undefined, target: CompilerSnapshot['target'], styleHandler: StyleHandler, basePlatform?: string, baseColorMixDynamicAlpha?: CompilerTransformServices['colorMixDynamicAlpha']) {
  const { finalize: _finalize, ...styleOptions } = options ?? {}
  const properties = target === 'web' ? [] : styleOptions.cssOptions?.preserveWebkitProperties ?? baseProperties
  let skyline = target === 'weapp' ? styleOptions.cssOptions?.skyline ?? baseSkyline : false
  // 样式处理和最终清理共享本次调用的配置快照，避免异步阶段读取不同配置。
  const preserveWebkitProperties = properties === undefined ? undefined : [...properties]
  let colorMixDynamicAlpha = target === 'weapp' ? styleOptions.cssOptions?.colorMixDynamicAlpha ?? baseColorMixDynamicAlpha : 'strict'
  const resolved = resolveStyleOptions({ ...styleOptions, cssOptions: { ...styleOptions.cssOptions, colorMixDynamicAlpha } })
  let resolvedStyleOptions = preserveWebkitProperties === undefined && skyline === undefined
    ? resolved
    : {
        ...resolved,
        cssOptions: { ...resolved.cssOptions, preserveWebkitProperties, ...(skyline === undefined ? {} : { skyline }) },
      }
  // 目标只依赖平台配置，查询阶段不应提前创建未探测内容的完整管线。
  const styleTarget = colorMixDynamicAlpha !== 'strict' || skyline === true
    ? styleHandler.getTarget?.(resolvedStyleOptions) ?? styleHandler.getPipeline(resolvedStyleOptions).target
    : undefined
  if (colorMixDynamicAlpha !== 'strict') {
    if (styleTarget !== 'generic' && styleTarget !== 'mini-program') {
      colorMixDynamicAlpha = 'strict'
      resolvedStyleOptions = { ...resolvedStyleOptions, cssOptions: { ...resolvedStyleOptions.cssOptions, colorMixDynamicAlpha } }
    }
  }
  if (skyline === true) {
    // 快照目标不覆盖实际样式目标，复用管线解析合并后的平台及 native 配置。
    const platform = resolvedStyleOptions.cssOptions?.platform ?? resolvedStyleOptions.platform ?? basePlatform
    if (!resolveSkylineTypographyCompatibility({ ...resolvedStyleOptions, platform }, styleTarget === 'generic' || styleTarget === 'mini-program')) {
      skyline = false
      resolvedStyleOptions = { ...resolvedStyleOptions, cssOptions: { ...resolvedStyleOptions.cssOptions, skyline } }
    }
  }
  return {
    finalize: _finalize,
    preserveWebkitProperties,
    skyline,
    colorMixDynamicAlpha,
    styleOptions: resolvedStyleOptions,
  }
}

function finalizeResultRoot(result: Awaited<ReturnType<StyleHandler>>, snapshot: CompilerSnapshot, shouldFinalize: boolean, preserveWebkitProperties: string[] | undefined, skyline: boolean | undefined, colorMixDynamicAlpha: CompilerTransformServices['colorMixDynamicAlpha']) {
  if (!shouldFinalize) {
    return
  }
  if (result.root.type === 'root') {
    finalizeMiniProgramCssRoot(result.root, {
      isTailwindcssV4: snapshot.target === 'weapp',
      cssOptions: { skyline, colorMixDynamicAlpha },
      preserveWebkitProperties,
    })
  }
  if (snapshot.target === 'weapp') {
    stripTailwindBannerComments(result.root)
  }
  result.css = result.root.toString()
}

interface CreateCompilerTransformsOptions {
  ensureActive: () => void
  track: <T>(task: Promise<T>) => Promise<T>
  services: CompilerTransformServices
}

export function createCompilerTransforms({ ensureActive, track, services }: CreateCompilerTransformsOptions) {
  let styleHandler: CompilerTransformServices['styleHandler'] | undefined = services.styleHandler
  let jsHandler: CompilerTransformServices['jsHandler'] | undefined = services.jsHandler
  let templateHandler: CompilerTransformServices['templateHandler'] | undefined = services.templateHandler
  let preserveWebkitProperties = services.preserveWebkitProperties
  let skyline = services.skyline
  let colorMixDynamicAlpha = services.colorMixDynamicAlpha
  let stylePlatform = services.stylePlatform
  let cachedTemplateClassSet: Set<string> | undefined
  let cachedTemplateOptions: Parameters<CompilerTransformServices['templateHandler']>[1]

  function clearCache() {
    cachedTemplateClassSet = undefined
    cachedTemplateOptions = undefined
  }

  // 关闭由核心排空任务后执行；仅来源移除仍保留活动实例的转换缓存。
  function dispose() {
    clearCache()
    styleHandler = undefined
    jsHandler = undefined
    templateHandler = undefined
    preserveWebkitProperties = undefined
    skyline = undefined
    colorMixDynamicAlpha = undefined
    stylePlatform = undefined
  }

  function createTemplateOptions(
    classSet: Set<string>,
    options?: Parameters<Compiler['transformTemplate']>[2],
  ) {
    const isDefault = !options || Object.keys(options).length === 0
    if (isDefault && cachedTemplateClassSet === classSet && cachedTemplateOptions) {
      return cachedTemplateOptions
    }
    const transformJs = jsHandler!
    const resolved = {
      ...options,
      classSetMode: 'exact' as const,
      jsHandler: (jsSource: string, _runtimeSet?: Set<string>, jsOptions?: Parameters<CompilerTransformServices['jsHandler']>[2]) => transformJs(jsSource, classSet, {
        ...jsOptions,
        tailwindcssMajorVersion: jsOptions?.tailwindcssMajorVersion ?? 4,
      }),
      runtimeSet: classSet,
    }
    if (isDefault) {
      cachedTemplateClassSet = classSet
      cachedTemplateOptions = resolved
    }
    return resolved
  }

  function transformCss(css: string, snapshot: CompilerSnapshot, options?: Parameters<Compiler['transformCss']>[2]) {
    ensureActive()
    getInternalCompilerSnapshot(snapshot)
    const resolved = resolveCssTransformOptions(options, preserveWebkitProperties, skyline, snapshot.target, styleHandler!, stylePlatform, colorMixDynamicAlpha)
    const shouldFinalize = resolved.finalize ?? snapshot.target === 'weapp'
    return track(styleHandler!(css, resolved.styleOptions).then((result) => {
      const cloned = clonePostcssResult(result)
      finalizeResultRoot(cloned, snapshot, shouldFinalize, resolved.preserveWebkitProperties, resolved.skyline, resolved.colorMixDynamicAlpha)
      return cloned
    }))
  }

  function transformCssRoot(root: Parameters<Compiler['transformCssRoot']>[0], snapshot: CompilerSnapshot, options?: Parameters<Compiler['transformCssRoot']>[2]) {
    ensureActive()
    getInternalCompilerSnapshot(snapshot)
    const resolved = resolveCssTransformOptions(options, preserveWebkitProperties, skyline, snapshot.target, styleHandler!, stylePlatform, colorMixDynamicAlpha)
    const shouldFinalize = resolved.finalize ?? snapshot.target === 'weapp'
    return track(styleHandler!.transformRoot(root, resolved.styleOptions).then((result) => {
      finalizeResultRoot(result, snapshot, shouldFinalize, resolved.preserveWebkitProperties, resolved.skyline, resolved.colorMixDynamicAlpha)
      return result
    }))
  }

  function transformJavaScript(source: string, snapshot: CompilerSnapshot, options?: Parameters<Compiler['transformJavaScript']>[2]) {
    ensureActive()
    const classSet = getInternalCompilerSnapshot(snapshot).classSet
    const resolvedOptions = options?.tailwindcssMajorVersion === undefined
      ? options ? { ...options, tailwindcssMajorVersion: 4 } : DEFAULT_JS_OPTIONS
      : options
    // 显式快照可包含自定义 utility 和 JS 转义拼写；通用前缀预检不能否定快照中的候选。
    // 匹配仍由 handler 的 classNameSet 精确约束，并复用其解析快速路径与缓存。
    return track(Promise.resolve(jsHandler!(source, classSet, resolvedOptions)))
  }

  function transformTemplate(source: string, snapshot: CompilerSnapshot, options?: Parameters<Compiler['transformTemplate']>[2]) {
    ensureActive()
    const classSet = getInternalCompilerSnapshot(snapshot).classSet
    return track(templateHandler!(source, createTemplateOptions(classSet, options)))
  }

  return {
    clearCache,
    dispose,
    transformCss,
    transformCssRoot,
    transformJavaScript,
    transformTemplate,
  }
}
