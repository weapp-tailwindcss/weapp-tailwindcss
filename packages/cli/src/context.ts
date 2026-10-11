import path from 'node:path'
import process from 'node:process'

export function formatOutputPath(target: string, baseDir?: string) {
  const root = baseDir ?? process.cwd()
  const relative = path.relative(root, target)
  if (!relative) {
    return '.'
  }
  if (relative.startsWith('..')) {
    return path.normalize(target)
  }
  return relative.startsWith('.') ? relative : `.${path.sep}${relative}`
}
