import { lstat } from 'node:fs/promises'
import path from 'node:path'

/** 构建器只能清理和交付项目内部的独立目录，不能穿越链接或项目根。 */
export function projectOutputRoot(project: string, output: string, paths: typeof path = path) {
  const root = paths.resolve(project)
  const selected = paths.resolve(root, output)
  const within = paths.relative(root, selected)
  if (!within || within === '..' || within.startsWith(`..${paths.sep}`) || paths.isAbsolute(within)) {
    throw new Error('实际构建输出必须位于项目的独立目录')
  }
  return selected
}

export function projectOutputAncestors(project: string, output: string, paths: typeof path = path) {
  const root = paths.resolve(project)
  const selected = projectOutputRoot(root, output, paths)
  const ancestors: string[] = []
  for (let current = selected; paths.relative(root, current); current = paths.dirname(current)) {
    ancestors.push(current)
  }
  return ancestors
}

export async function assertOutputOwnership(project: string, output: string) {
  const selected = projectOutputRoot(project, output)
  for (const current of projectOutputAncestors(project, output)) {
    try {
      if ((await lstat(current)).isSymbolicLink()) {
        throw new Error(`构建输出路径不允许符号链接：${current}`)
      }
    }
    catch (error) {
      if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 'ENOENT') {
        throw error
      }
    }
  }
  return selected
}
