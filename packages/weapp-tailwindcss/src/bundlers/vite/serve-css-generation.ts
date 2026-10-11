import type { Plugin } from 'vite'
import type { CssStage } from '@/compiler'
import { vitePluginName } from '@/constants'
import { hasTailwindApplyDirective, hasTailwindRootDirectives, hasTailwindSourceDirectives } from '../../generation/directives'
import { isSourceStyleRequest } from '../../generation/style-requests'

const SPECIAL_QUERY_RE = /[?&](?:worker|sharedworker|raw|url)\b/
const COMMON_JS_PROXY_RE = /\?commonjs-proxy/
const VITE_CSS_HMR_MODULE_RE = /\b__vite__updateStyle\s*\(/
const VITE_CSS_CONST_RE = /\bconst\s+__vite__css\s*=\s*("(?:\\[\s\S]|[^"])*")/
const DEFERRED_CSS_HMR_QUERY_RE = /[?&](?:hmr(?:[=&]|$)|t=\d+)/

interface ViteCssGenerationOptions {
  generateCss: (id: string, code: string, hookContext?: {
    addWatchFile?: (id: string) => void
    emitFile?: (emittedFile: { type: 'asset', fileName: string, source: string }) => string
    cssStage?: CssStage | undefined
  }) => Promise<string | undefined> | string | undefined
  getCommand: () => string | undefined
  onTailwindRootCss?: ((id: string, code: string) => Promise<void> | void) | undefined
  shouldGenerate: () => boolean
  shouldGenerateBuild?: (() => boolean) | undefined
  shouldDeferGeneration?: ((id: string, code: string) => boolean) | undefined
}

function decodeJsStringLiteral(literal: string) {
  try {
    return JSON.parse(literal) as string
  }
  catch {
    return undefined
  }
}

function encodeJsStringLiteral(value: string) {
  return JSON.stringify(value)
}

function extractViteCssHmrModuleCss(code: string) {
  const match = VITE_CSS_CONST_RE.exec(code)
  if (!match?.[1]) {
    return undefined
  }
  const css = decodeJsStringLiteral(match[1])
  if (typeof css !== 'string') {
    return undefined
  }
  return {
    css,
    start: match.index + match[0].lastIndexOf(match[1]),
    end: match.index + match[0].length,
  }
}

function replaceViteCssHmrModuleCss(code: string, css: string) {
  const extracted = extractViteCssHmrModuleCss(code)
  if (!extracted) {
    return undefined
  }
  return `${code.slice(0, extracted.start)}${encodeJsStringLiteral(css)}${code.slice(extracted.end)}`
}

function isViteServeStyleRequest(id: string, command: string | undefined) {
  return command === 'serve'
    && isSourceStyleRequest(id)
    && !SPECIAL_QUERY_RE.test(id)
    && !COMMON_JS_PROXY_RE.test(id)
}

function isViteServeCssRootRequest(id: string, command: string | undefined) {
  return command === 'serve'
    && isSourceStyleRequest(id)
    && !SPECIAL_QUERY_RE.test(id)
    && !COMMON_JS_PROXY_RE.test(id)
}

function isViteBuildStyleRequest(id: string, command: string | undefined) {
  return command === 'build'
    && isSourceStyleRequest(id)
    && !SPECIAL_QUERY_RE.test(id)
    && !COMMON_JS_PROXY_RE.test(id)
}

function isViteCssHmrModule(code: string, id: string, command: string | undefined) {
  return isViteServeStyleRequest(id, command)
    && VITE_CSS_HMR_MODULE_RE.test(code)
    && (
      /[?&](?:direct|vue)(?:&|$)/.test(id)
      || DEFERRED_CSS_HMR_QUERY_RE.test(id)
    )
}

function hasViteCssGenerationDirective(code: string) {
  return hasTailwindRootDirectives(code)
    || hasTailwindSourceDirectives(code, { importFallback: true })
    || hasTailwindApplyDirective(code)
}

function hasViteServeCssRootDirective(code: string) {
  return hasTailwindRootDirectives(code)
}

export function createViteCssGenerationPlugins(options: ViteCssGenerationOptions): Plugin[] {
  return [{
    name: `${vitePluginName}:generate:serve`,
    apply: 'serve',
    enforce: 'pre',
    async transform(code, id) {
      if (!options.shouldGenerate() || !isViteServeCssRootRequest(id, options.getCommand())) {
        return
      }
      if (!hasTailwindRootDirectives(code)) {
        return
      }
      if (DEFERRED_CSS_HMR_QUERY_RE.test(id)) {
        return
      }
      await options.onTailwindRootCss?.(id, code)
      const generatedCss = await options.generateCss(id, code, {
        ...(this.addWatchFile ? { addWatchFile: this.addWatchFile.bind(this) } : {}),
        ...(this.emitFile ? { emitFile: this.emitFile.bind(this) } : {}),
        cssStage: 'raw',
      })
      if (generatedCss === undefined || generatedCss === code) {
        return
      }
      return {
        code: generatedCss,
        map: null,
      }
    },
  }, {
    name: `${vitePluginName}:generate:build`,
    apply: 'build',
    enforce: 'pre',
    async transform(code, id) {
      if (
        !options.shouldGenerate()
        || options.shouldGenerateBuild?.() === false
        || !isViteBuildStyleRequest(id, options.getCommand())
      ) {
        return
      }
      if (!hasViteCssGenerationDirective(code)) {
        return
      }
      if (options.shouldDeferGeneration?.(id, code)) {
        return
      }
      if (hasViteServeCssRootDirective(code)) {
        await options.onTailwindRootCss?.(id, code)
      }
      const generatedCss = await options.generateCss(id, code, {
        ...(this.addWatchFile ? { addWatchFile: this.addWatchFile.bind(this) } : {}),
        ...(this.emitFile ? { emitFile: this.emitFile.bind(this) } : {}),
        cssStage: 'raw',
      })
      if (generatedCss === undefined || generatedCss === code) {
        return
      }
      return {
        code: generatedCss,
        map: null,
      }
    },
  }, {
    name: `${vitePluginName}:generate:serve-hmr`,
    apply: 'serve',
    enforce: 'post',
    async transform(code, id) {
      if (!options.shouldGenerate() || !isViteCssHmrModule(code, id, options.getCommand())) {
        return
      }
      const extracted = extractViteCssHmrModuleCss(code)
      if (!extracted) {
        return
      }
      if (!hasViteCssGenerationDirective(extracted.css)) {
        return
      }
      if (options.shouldDeferGeneration?.(id, extracted.css)) {
        return
      }
      if (hasViteServeCssRootDirective(extracted.css)) {
        await options.onTailwindRootCss?.(id, extracted.css)
      }
      const generatedCss = await options.generateCss(id, extracted.css, {
        ...(this.addWatchFile ? { addWatchFile: this.addWatchFile.bind(this) } : {}),
        ...(this.emitFile ? { emitFile: this.emitFile.bind(this) } : {}),
        cssStage: 'framework-processed',
      })
      if (generatedCss === undefined || generatedCss === extracted.css) {
        return
      }
      const nextCode = replaceViteCssHmrModuleCss(code, generatedCss)
      if (nextCode === undefined || nextCode === code) {
        return
      }
      return {
        code: nextCode,
        map: null,
      }
    },
  }]
}
