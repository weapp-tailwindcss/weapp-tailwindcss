import { realpathSync } from 'node:fs'
import path from 'node:path'

export function toPosixPath(value: string) {
  return value.replaceAll('\\', '/')
}

export function resolveSourceScanPath(value: string) {
  return resolveSourceScanPathWithApi(value, sourcePathApi(value))
}

export function resolveSourceScanPathWithApi(value: string, pathApi: Pick<typeof path, 'resolve' | 'dirname' | 'basename' | 'join'>) {
  const resolved = pathApi.resolve(value)
  let current = resolved
  const missing: string[] = []
  while (true) {
    try {
      return pathApi.join(realpathSync.native(current), ...missing.reverse())
    }
    catch (error) {
      const parent = pathApi.dirname(current)
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT' || parent === current) {
        return resolved
      }
      // 删除后的路径仍沿现存父目录解析，保持符号链接工作区中的源码身份。
      missing.push(pathApi.basename(current))
      current = parent
    }
  }
}

export function sourcePathApi(...values: string[]) {
  if (values.some(value => /^[A-Z]:[\\/]/i.test(value) || value.startsWith('\\\\'))) {
    return path.win32
  }
  if (values.some(value => path.posix.isAbsolute(value))) {
    return path.posix
  }
  return values.some(value => value.includes('\\')) ? path.win32 : path
}
