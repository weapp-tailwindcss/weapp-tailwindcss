import type { Plugin } from 'vite'
import type { CssStage } from '@/compiler'
import type { AppType } from '@/types'
import path from 'node:path'
import { createDeferredCssSourceMarker, stripTailwindConfigDirectives } from '@weapp-tailwindcss/postcss/transform'
import { vitePluginName } from '@/constants'
import { hasTailwindApplyDirective, hasTailwindRootDirectives, normalizeTailwindConfigDirectives } from '../../generation/directives'
import { isSourceStyleRequest } from '../../generation/style-requests'
import { resolveTailwindcssImport, rewriteTailwindcssImportsInCode } from '../shared/css-imports'
import { isSfcStyleSourceFile } from './generate-bundle/sfc-style-source'
import { cleanUrl, isCSSRequest } from './utils'

function joinPosixPath(base: string, subpath: string) {
  if (base.endsWith('/')) {
    return `${base}${subpath}`
  }
  return `${base}/${subpath}`
}

function isCssLikeImporter(importer?: string | null) {
  if (!importer) {
    return false
  }
  const normalized = cleanUrl(importer)
  return isSourceStyleRequest(importer) || isCSSRequest(normalized) || normalized.endsWith('/*')
}

interface RewriteCssImportsOptions {
  appType?: AppType | undefined
  getAppType?: (() => AppType | undefined) | undefined
  generateTailwindCss?: ((id: string, code: string, hookContext?: {
    addWatchFile?: (id: string) => void
    emitFile?: (emittedFile: { type: 'asset', fileName: string, source: string }) => string
    cssStage?: CssStage | undefined
  }) => Promise<string | undefined> | string | undefined) | undefined
  shouldOwnTailwindGeneration?: boolean | undefined
  shouldRewrite: boolean
  rootImport?: string | undefined
  weappTailwindcssDirPosix: string
  onTailwindRootCss?: ((id: string, code: string) => Promise<void> | void) | undefined
  onCssSourceTransform?: ((id: string, code: string) => Promise<void> | void) | undefined
  shouldGenerateCss?: ((id: string, code: string) => boolean) | undefined
  shouldDeferGeneration?: ((id: string, code: string) => boolean) | undefined
}

export function createRewriteCssImportsPlugins(options: RewriteCssImportsOptions): Plugin[] {
  if (!options.shouldRewrite && !options.shouldOwnTailwindGeneration) {
    return []
  }
  const { appType, getAppType, rootImport, shouldOwnTailwindGeneration, weappTailwindcssDirPosix } = options
  const resolveAppType = () => getAppType?.() ?? appType
  return [
    {
      name: `${vitePluginName}:rewrite-css-imports`,
      enforce: 'pre',
      resolveId(id, importer) {
        if (!options.shouldRewrite) {
          return null
        }
        const replacement = resolveTailwindcssImport(id, weappTailwindcssDirPosix, {
          join: joinPosixPath,
          appType: resolveAppType(),
          rootImport,
        })
        if (!replacement) {
          return null
        }
        if (importer && !isCssLikeImporter(importer)) {
          return null
        }
        return replacement
      },
      async transform(this: { addWatchFile?: (id: string) => void, emitFile?: (emittedFile: { type: 'asset', fileName: string, source: string }) => string }, code, id) {
        if (!isCSSRequest(id)) {
          return null
        }
        const file = cleanUrl(id)
        const normalizedCode = !isSfcStyleSourceFile(file) && (hasTailwindRootDirectives(code) || code.includes('@config'))
          ? normalizeTailwindConfigDirectives(code, path.dirname(file))
          : code
        await options.onCssSourceTransform?.(id, normalizedCode)
        const hasTailwindRoot = hasTailwindRootDirectives(normalizedCode, { importFallback: true })
        if (hasTailwindRoot) {
          await options.onTailwindRootCss?.(id, normalizedCode)
        }
        const shouldGenerateInPreTransform = !options.shouldDeferGeneration?.(id, normalizedCode)
          && (hasTailwindRoot || options.shouldGenerateCss?.(id, normalizedCode))
        if (options.shouldOwnTailwindGeneration && shouldGenerateInPreTransform) {
          const generatedCss = await options.generateTailwindCss?.(id, normalizedCode, {
            ...(this.addWatchFile ? { addWatchFile: this.addWatchFile.bind(this) } : {}),
            ...(this.emitFile ? { emitFile: this.emitFile.bind(this) } : {}),
            cssStage: 'raw',
          })
          if (generatedCss !== undefined) {
            return {
              code: generatedCss,
              map: null,
            }
          }
        }

        if (!options.shouldRewrite) {
          const deferredCode = shouldOwnTailwindGeneration && hasTailwindRoot && !shouldGenerateInPreTransform
            ? `${normalizedCode}\n${createDeferredCssSourceMarker(id)}`
            : normalizedCode
          if (deferredCode !== code) {
            return {
              code: deferredCode,
              map: null,
            }
          }
          return null
        }
        const rewritten = rewriteTailwindcssImportsInCode(normalizedCode, weappTailwindcssDirPosix, {
          join: joinPosixPath,
          appType: resolveAppType(),
          rootImport,
        })
        const transformed = shouldOwnTailwindGeneration
          ? stripTailwindConfigDirectives(rewritten ?? normalizedCode)
          : rewritten
        const nextCode = shouldOwnTailwindGeneration && hasTailwindRoot && !shouldGenerateInPreTransform
          ? `${transformed ?? normalizedCode}\n${createDeferredCssSourceMarker(id)}`
          : transformed
        if (!nextCode || nextCode === code) {
          return null
        }
        return {
          code: nextCode,
          map: null,
        }
      },
    },
  ]
}

export function hasVitePipelineTailwindGenerationDirective(code: string) {
  return hasTailwindRootDirectives(code) || hasTailwindApplyDirective(code)
}
