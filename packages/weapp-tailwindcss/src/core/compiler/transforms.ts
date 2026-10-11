import type { StyleHandler } from '@weapp-tailwindcss/postcss/transform'
import type { Compiler, CompilerCssTransformOptions, CompilerSnapshot } from './types'
import type { UserDefinedOptions } from '@/types'
import { finalizeMiniProgramCssRoot, stripTailwindBannerComments } from '@weapp-tailwindcss/postcss/transform'
import { getCompilerContext } from '@/context'
import { getInternalCompilerSnapshot } from './snapshot'

const DEFAULT_JS_OPTIONS = Object.freeze({ tailwindcssMajorVersion: 4 as const })
const DEFAULT_STYLE_OPTIONS = Object.freeze({ isMainChunk: true as const })

function clonePostcssResult<Result extends Awaited<ReturnType<StyleHandler>>>(result: Result): Result {
  return Object.assign(Object.create(Object.getPrototypeOf(result)), result, {
    messages: [...result.messages],
    root: result.root.clone(),
  }) as Result
}

function resolveStyleOptions(options?: Parameters<StyleHandler>[1]) {
  if (!options) {
    return DEFAULT_STYLE_OPTIONS
  }
  return options?.isMainChunk === undefined
    ? { ...options, isMainChunk: true }
    : options
}

function resolveCssTransformOptions(options?: CompilerCssTransformOptions) {
  const { finalize: _finalize, ...styleOptions } = options ?? {}
  return {
    finalize: _finalize,
    styleOptions: resolveStyleOptions(styleOptions),
  }
}

function finalizeResultRoot(result: Awaited<ReturnType<StyleHandler>>, snapshot: CompilerSnapshot, shouldFinalize: boolean) {
  if (!shouldFinalize) {
    return
  }
  if (result.root.type === 'root') {
    finalizeMiniProgramCssRoot(result.root, {
      isTailwindcssV4: snapshot.target === 'weapp',
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
  userOptions: UserDefinedOptions
}

export function createCompilerTransforms({ ensureActive, track, userOptions }: CreateCompilerTransformsOptions) {
  const context = getCompilerContext({
    ...userOptions,
    __internalDeferMissingCssEntriesWarning: true,
  } as UserDefinedOptions)
  const styleHandler = context.styleHandler as StyleHandler
  let cachedTemplateClassSet: Set<string> | undefined
  let cachedTemplateOptions: Parameters<typeof context.templateHandler>[1]

  function clearCache() {
    cachedTemplateClassSet = undefined
    cachedTemplateOptions = undefined
  }

  function createTemplateOptions(
    classSet: Set<string>,
    options?: Parameters<Compiler['transformTemplate']>[2],
  ) {
    const isDefault = !options || Object.keys(options).length === 0
    if (isDefault && cachedTemplateClassSet === classSet && cachedTemplateOptions) {
      return cachedTemplateOptions
    }
    const resolved = {
      ...options,
      classSetMode: 'exact' as const,
      jsHandler: (jsSource: string, _runtimeSet?: Set<string>, jsOptions?: Parameters<typeof context.jsHandler>[2]) => context.jsHandler(jsSource, classSet, {
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
    const resolved = resolveCssTransformOptions(options)
    const shouldFinalize = resolved.finalize ?? snapshot.target === 'weapp'
    return track(styleHandler(css, resolved.styleOptions).then((result) => {
      const cloned = clonePostcssResult(result)
      finalizeResultRoot(cloned, snapshot, shouldFinalize)
      return cloned
    }))
  }

  function transformCssRoot(root: Parameters<Compiler['transformCssRoot']>[0], snapshot: CompilerSnapshot, options?: Parameters<Compiler['transformCssRoot']>[2]) {
    ensureActive()
    getInternalCompilerSnapshot(snapshot)
    const resolved = resolveCssTransformOptions(options)
    const shouldFinalize = resolved.finalize ?? snapshot.target === 'weapp'
    return track(styleHandler.transformRoot(root, resolved.styleOptions).then((result) => {
      finalizeResultRoot(result, snapshot, shouldFinalize)
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
    return track(Promise.resolve(context.jsHandler(source, classSet, resolvedOptions)))
  }

  function transformTemplate(source: string, snapshot: CompilerSnapshot, options?: Parameters<Compiler['transformTemplate']>[2]) {
    ensureActive()
    const classSet = getInternalCompilerSnapshot(snapshot).classSet
    return track(context.templateHandler(source, createTemplateOptions(classSet, options)))
  }

  return {
    clearCache,
    transformCss,
    transformCssRoot,
    transformJavaScript,
    transformTemplate,
  }
}
