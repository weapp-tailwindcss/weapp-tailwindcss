import assert from 'node:assert/strict'
import path from 'node:path'

/** 用文件系统路径语义核对生产产物归属，允许目录自身。 */
export function insideProductionRoot(root, file, paths = path) {
  const relative = paths.relative(root, file)
  return !paths.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${paths.sep}`)
}

/** URL 段先解码，再交给宿主路径 API；不接受歧义反斜杠。 */
export function productionRequestFile(root, pathname, paths = path) {
  const segments = pathname.split('/').map(decodeURIComponent)
  assert.ok(segments.every(segment => !segment.includes('\\')), '生产 URL 不接受反斜杠')
  const file = paths.resolve(root, ...segments)
  assert.ok(insideProductionRoot(root, file, paths), '生产请求不能离开归属目录')
  return file
}
