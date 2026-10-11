import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'

export function sameFilesystemPath(left, right, platform = process.platform) {
  const paths = platform === 'win32' ? path.win32 : path.posix
  return paths.isAbsolute(left) && paths.isAbsolute(right) && paths.relative(left, right) === ''
}

export function appendNodeImport(nodeOptions, preloadPath, platform = process.platform) {
  const url = pathToFileURL(preloadPath, { windows: platform === 'win32' })
  return `${nodeOptions ?? ''}${nodeOptions ? ' ' : ''}--import=${url.href}`
}
