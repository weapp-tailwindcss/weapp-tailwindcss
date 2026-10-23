import type { IStyleHandlerOptions } from '@weapp-tailwindcss/postcss/types'
import type { FrameworkPolicy } from '@/compiler/framework-policy'
import type { InternalUserDefinedOptions } from '@/types/index'
import { finalizeMiniProgramCss } from '@weapp-tailwindcss/postcss/transform'
import { resolveContextGeneratorConfiguration } from '@/generator/context-options'
import { resolvePostcssRequestOption } from '../source-resolver/postcss-source'
import { isVueScopedStyleRequest } from '../style-requests'

export function hasMiniProgramTailwindV4PreflightReset(css: string) {
  return /(?:^|[},])\s*view\s*,\s*text\s*,\s*::after\s*,\s*::before\s*\{[^}]*\bborder\s*:\s*0\s+solid\b/.test(css)
}

function isMiniProgramGeneratorTarget(target: string) {
  return target !== 'web'
}

export function finalizeMiniProgramGeneratorCss(
  css: string,
  target: string,
  _majorVersion: number | undefined,
  cssPreflight: InternalUserDefinedOptions['cssPreflight'],
  options: {
    injectPreflight?: boolean | undefined
    preservePreflight?: boolean | undefined
    removeEmptyAtRuleAncestors?: boolean | undefined
    styleOptions?: Partial<IStyleHandlerOptions> | undefined
  } = {},
) {
  if (!isMiniProgramGeneratorTarget(target)) {
    return css
  }
  if (options.styleOptions && isVueScopedStyleRequest(resolvePostcssRequestOption(options.styleOptions))) {
    return finalizeMiniProgramCss(css, {
      cssPreflight: false,
      cssSelectorReplacement: options.styleOptions?.cssOptions?.cssSelectorReplacement
        ?? options.styleOptions?.cssSelectorReplacement,
      isTailwindcssV4: true,
      removeEmptyAtRuleAncestors: options.removeEmptyAtRuleAncestors,
      preserveWebkitProperties: options.styleOptions.cssOptions?.preserveWebkitProperties,
      tailwindcssV4GradientFallback: options.styleOptions?.cssOptions?.tailwindcssV4GradientFallback
        ?? options.styleOptions?.tailwindcssV4GradientFallback,
    })
  }
  const hasPreflightReset = hasMiniProgramTailwindV4PreflightReset(css)
  const injectPreflight = options.injectPreflight !== false
    && !hasPreflightReset
  const preservePreflight = options.preservePreflight !== false
  return finalizeMiniProgramCss(css, {
    cssPreflight: cssPreflight === false || (options.injectPreflight === false && (!hasPreflightReset || !preservePreflight))
      ? false
      : injectPreflight
        ? cssPreflight
        : hasPreflightReset && preservePreflight
          ? cssPreflight
          : undefined,
    cssSelectorReplacement: options.styleOptions?.cssOptions?.cssSelectorReplacement
      ?? options.styleOptions?.cssSelectorReplacement,
    isTailwindcssV4: true,
    removeEmptyAtRuleAncestors: options.removeEmptyAtRuleAncestors,
    preserveWebkitProperties: options.styleOptions?.cssOptions?.preserveWebkitProperties,
    tailwindcssV4GradientFallback: options.styleOptions?.cssOptions?.tailwindcssV4GradientFallback
      ?? options.styleOptions?.tailwindcssV4GradientFallback,
  })
}

export function resolveMiniProgramPreflightModeForGeneratorCss(
  opts: InternalUserDefinedOptions,
  options: {
    cssHandlerOptions: IStyleHandlerOptions
    frameworkPolicy?: FrameworkPolicy | undefined
    isolateCurrentCssCandidates: boolean
    localImports?: string | undefined
    primaryCssSource?: boolean | undefined
    explicitCssSource?: boolean | undefined
  },
) {
  if (isVueScopedStyleRequest(resolvePostcssRequestOption(options.cssHandlerOptions))) {
    return {
      inject: false,
      preserve: false,
    }
  }
  const policy = options.frameworkPolicy ?? resolveContextGeneratorConfiguration(opts, {
    appType: opts.appType,
    uniAppX: opts.uniAppX,
    nativeStyle: options.cssHandlerOptions.uniAppX === true,
    styleTarget: options.cssHandlerOptions.uniAppXCssTarget,
  }).frameworkPolicy
  if (policy.preflight.suppress) {
    return {
      inject: false,
      preserve: false,
    }
  }
  const shouldInjectLocalImportPreflight = policy.preflight.localImports && Boolean(options.localImports?.trim())
  if (opts.cssPreflight === false) {
    return {
      inject: false,
      preserve: false,
    }
  }
  if (options.primaryCssSource) {
    return {
      inject: true,
      preserve: true,
    }
  }
  if (options.explicitCssSource) {
    return {
      inject: false,
      preserve: true,
    }
  }
  if (options.cssHandlerOptions.isMainChunk) {
    return {
      inject: true,
      preserve: true,
    }
  }
  if (!options.cssHandlerOptions.isMainChunk && !options.primaryCssSource && !options.explicitCssSource) {
    return {
      inject: shouldInjectLocalImportPreflight,
      preserve: shouldInjectLocalImportPreflight,
    }
  }
  if (!options.isolateCurrentCssCandidates) {
    return {
      inject: true,
      preserve: true,
    }
  }
  return {
    inject: shouldInjectLocalImportPreflight,
    preserve: shouldInjectLocalImportPreflight,
  }
}
