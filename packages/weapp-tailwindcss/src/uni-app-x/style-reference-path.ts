import path from 'node:path'

const WINDOWS_SOURCE_RE = /^[a-z]:[\\/]|^[\\/]{2}[^\\/]/i

/** 按来源文件的盘符或共享根目录解析，再在 CSS 引用边界统一分隔符。 */
export function resolveStyleReferencePath(sourceFile: string, request: string) {
  const paths = WINDOWS_SOURCE_RE.test(sourceFile) ? path.win32 : path
  return paths.resolve(paths.dirname(sourceFile), request).replaceAll('\\', '/')
}
