import type { AppType } from '@/types'
import path from 'node:path'
import { rewriteCssImportSpecifiers, rewriteTailwindPackageImportStatements } from '@weapp-tailwindcss/postcss/transform'

const tailwindcssImportRE = /^(?:tailwindcss|weapp-tailwindcss)(?:\/.*)?$/
export function normalizeResolvedTailwindcssImports(code: string, pkgDir: string | undefined) {
  if (!pkgDir) {
    return code
  }
  const paths = /^[a-z]:[\\/]|^\\\\/i.test(pkgDir) ? path.win32 : path.posix
  return rewriteCssImportSpecifiers(code, (specifier) => {
    if (!paths.isAbsolute(specifier)) {
      return
    }
    const subpath = paths.relative(pkgDir, specifier)
    if (!['index.css', 'theme.css', 'utilities.css', 'preflight.css'].includes(subpath)) {
      return
    }
    // loader 解析后的包文件在生成边界恢复为包请求，不能作为浏览器 import 重新输出。
    return subpath === 'index.css' ? 'tailwindcss' : `tailwindcss/${subpath}`
  })
}

export interface ResolveTailwindcssImportOptions {
  join?: ((base: string, subpath: string) => string) | undefined
  appType?: AppType | undefined
  rootImport?: string | undefined
}

function normalizeTailwindcssSpecifier(specifier: string) {
  if (specifier === 'tailwindcss$' || specifier === 'weapp-tailwindcss$') {
    return specifier.slice(0, -1)
  }
  return specifier
}

function getTailwindcssSubpath(specifier: string) {
  if (specifier === 'tailwindcss' || specifier === 'weapp-tailwindcss') {
    return 'index.css'
  }
  return specifier.replace(/^(?:tailwindcss|weapp-tailwindcss)\//, '')
}

export function resolveTailwindcssImport(
  specifier: string,
  pkgDir: string,
  options?: ResolveTailwindcssImportOptions,
) {
  const normalized = normalizeTailwindcssSpecifier(specifier)
  if (!tailwindcssImportRE.test(normalized)) {
    return null
  }
  if (normalized === 'tailwindcss' || normalized === 'weapp-tailwindcss') {
    return options?.rootImport ?? (options?.join ?? path.join)(pkgDir, 'index.css')
  }
  const join = options?.join ?? path.join
  const subpath = getTailwindcssSubpath(normalized)
  return join(pkgDir, subpath)
}

export function rewriteTailwindcssImportsInCode(
  code: string,
  pkgDir: string,
  options?: ResolveTailwindcssImportOptions,
) {
  return rewriteTailwindPackageImportStatements(code, specifier => resolveTailwindcssImport(specifier, pkgDir, options))
}
