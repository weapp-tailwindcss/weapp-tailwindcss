import { readFile, stat } from 'node:fs/promises'
import { isPendingOutputError } from './file-entries'

export async function readOutputFileOnce(
  file: string,
  options: { signal?: AbortSignal | undefined, ensureActive?: () => void } = {},
) {
  options.ensureActive?.()
  let content: string
  try {
    content = await readFile(file, { encoding: 'utf8', signal: options.signal })
  }
  catch (error) {
    options.ensureActive?.()
    if (!isPendingOutputError(error)) {
      throw error
    }
    return undefined
  }
  options.ensureActive?.()
  return content
}

export async function getOutputMtimeOnce(file: string, ensureActive?: () => void) {
  ensureActive?.()
  let mtime: number
  try {
    mtime = (await stat(file)).mtimeMs
  }
  catch (error) {
    ensureActive?.()
    if (!isPendingOutputError(error)) {
      throw error
    }
    return 0
  }
  ensureActive?.()
  return mtime
}
