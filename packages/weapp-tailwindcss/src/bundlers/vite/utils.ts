import type { ExistingRawSourceMap } from 'rollup'
import path from 'node:path'
import process from 'node:process'
import { cleanUrl, ensurePosix } from '@weapp-tailwindcss/shared'
import { isSourceStyleRequest } from '../../generation/style-requests'

export function slash(p: string): string {
  return ensurePosix(p)
}

export const isWindows = process.platform === 'win32'

const cssLangs = `\\.(?:css|less|sass|scss|styl|stylus|pcss|postcss)(?:$|\\?)`
export const cssLangRE = new RegExp(cssLangs)
const htmlLangRE = /\.html?(?:$|\?)/

export function isCSSRequest(request: string): boolean {
  return cssLangRE.test(request) || isSourceStyleRequest(request)
}

export function isWeappViteSidecarRequest(request: string): boolean {
  const queryIndex = request.indexOf('?')
  if (queryIndex < 0) {
    return false
  }
  const hashIndex = request.indexOf('#', queryIndex)
  const query = request.slice(queryIndex + 1, hashIndex < 0 ? undefined : hashIndex)
  return new URLSearchParams(query).has('weapp-vite-sidecar')
}

export function resolveViteCssPipelineRequestFile(request: string): string {
  return isWeappViteSidecarRequest(request) ? cleanUrl(request) : request
}

export function isHTMLRequest(request: string): boolean {
  return htmlLangRE.test(request)
}

export function normalizePath(id: string): string {
  return path.posix.normalize(isWindows ? ensurePosix(id) : id)
}
export { cleanUrl }

export async function formatPostcssSourceMap(
  rawMap: ExistingRawSourceMap,
  file: string,
): Promise<ExistingRawSourceMap> {
  const inputFileDir = path.dirname(file)

  const sources = rawMap.sources.map((source) => {
    const cleanSource = cleanUrl(decodeURIComponent(source))

    // 处理 PostCSS 虚拟文件路径
    if (cleanSource[0] === '<' && cleanSource.endsWith('>')) {
      return `\0${cleanSource}`
    }

    return normalizePath(path.resolve(inputFileDir, cleanSource))
  })

  return {
    file,
    mappings: rawMap.mappings,
    names: rawMap.names,
    sources,
    sourcesContent: rawMap.sourcesContent,
    version: rawMap.version,
  }
}
