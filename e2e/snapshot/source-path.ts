import { realpathSync } from 'node:fs'
import path from 'node:path'

const WINDOWS_PATH_RE = /^(?:[a-z]:|\\|\/\/)/i
const HBUILDERX_PROJECT_ALIAS_SEGMENT_RE = /^.+-[a-f\d]{10}-\d+$/

function pathApi(file: string) {
  if (WINDOWS_PATH_RE.test(file)) {
    return path.win32
  }
  return file.startsWith('/') ? path.posix : path
}

function resolveSourcePath(file: string, paths: typeof path) {
  const resolved = paths.resolve(file)
  // node:path 默认实现与 native fs 绑定真实宿主，不受 fixture 改写 process.platform 影响。
  if (paths !== path) {
    return resolved
  }
  try {
    return realpathSync.native(resolved)
  }
  catch {
    return resolved
  }
}

function relativeWithin(root: string, file: string, paths: typeof path) {
  const relative = paths.relative(root, file)
  if (!relative || relative === '..' || relative.startsWith(`..${paths.sep}`) || paths.isAbsolute(relative)) {
    return undefined
  }
  // CSS 来源标记属于可序列化的逻辑路径，在此边界统一分隔符。
  return relative.split(paths.sep).join('/')
}

function relativeHBuilderXAliasSource(file: string, paths: typeof path) {
  const resolved = paths.resolve(file)
  let directory = paths.dirname(resolved)
  while (directory !== paths.dirname(directory)) {
    if (HBUILDERX_PROJECT_ALIAS_SEGMENT_RE.test(paths.basename(directory))
      && paths.basename(paths.dirname(directory)) === 'weapp-tailwindcss-hbuilderx-projects') {
      return relativeWithin(directory, resolved, paths)
    }
    directory = paths.dirname(directory)
  }
  return undefined
}

/** 保留来源路径的 POSIX/Windows 语义，只消除当前项目及已知 IDE 别名的物理位置。 */
export function relativeGeneratedCssSource(projectRoot: string, sourceFile: string) {
  const projectPaths = pathApi(projectRoot)
  const sourcePaths = pathApi(sourceFile)
  const relative = projectPaths === sourcePaths
    ? relativeWithin(resolveSourcePath(projectRoot, projectPaths), resolveSourcePath(sourceFile, sourcePaths), projectPaths)
    : undefined
  return relative ?? relativeHBuilderXAliasSource(sourceFile, sourcePaths)
}
