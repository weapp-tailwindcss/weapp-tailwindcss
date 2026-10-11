import path from 'node:path'

export function resolveStylesheetImport(output: string, from: string, request: string, api = path) {
  if (/^(?:[a-z][\w+.-]*:)?\/\//i.test(request)) {
    throw new Error('尺寸复现只允许本地产物样式')
  }
  // WXSS 的前导 / 是产物根逻辑路径，在此显式转换为宿主文件系统路径。
  const absolute = request.startsWith('/')
    ? api.resolve(output, ...request.slice(1).split('/'))
    : api.resolve(api.dirname(from), request)
  const relative = api.relative(output, absolute)
  if (relative === '..' || relative.startsWith(`..${api.sep}`) || api.isAbsolute(relative)) {
    throw new Error('样式导入越过本轮输出目录')
  }
  return absolute
}
