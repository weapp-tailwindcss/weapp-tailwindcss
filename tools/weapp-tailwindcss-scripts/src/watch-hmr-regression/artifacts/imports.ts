import fs from 'node:fs/promises'
import path from 'node:path'
import { collectCssImportRequestsRoot, isLocalCssImportRequest, postcss } from '../../../../../packages/postcss/src/index'

const STYLE_OUTPUT_RE = /\.(?:css|wxss|acss|ttss|qss|jxss|tyss)$/i

/** CSS 的根路径属于产物 URL；没有输出根元数据时不能当作宿主文件系统根目录。 */
export function resolveRelativeStyleImport(file: string, request: string, paths = path) {
  const pathname = request.replace(/[?#].*$/, '')
  if (!isLocalCssImportRequest(request) || !pathname || /^[a-z][a-z\d+.-]*:/i.test(pathname)
    || path.posix.isAbsolute(pathname) || path.win32.isAbsolute(pathname)) {
    return undefined
  }
  return paths.resolve(paths.dirname(file), pathname)
}

/** 从已登记的样式产物遍历相对导入，循环去重，缺失依赖也留给快照门禁核对。 */
export async function collectImportedStyleFiles(files: string[]) {
  const visited = new Set(files)
  const pending = [...files]
  while (pending.length > 0) {
    const file = pending.pop()!
    if (!STYLE_OUTPUT_RE.test(file)) {
      continue
    }
    const css = await fs.readFile(file, 'utf8').catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') {
        return undefined
      }
      throw error
    })
    if (css == null) {
      continue
    }
    for (const request of collectCssImportRequestsRoot(postcss.parse(css, { from: file }))) {
      const target = resolveRelativeStyleImport(file, request)
      if (target && !visited.has(target)) {
        visited.add(target)
        pending.push(target)
      }
    }
  }
  return [...visited].sort()
}
