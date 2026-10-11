import { readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import { readFileIfExists } from '../text'

const GLOB_TOKEN_RE = /\*/
const VIRTUAL_OUTPUT_ID_RE = /[\0?#]/
const REGEXP_ESCAPE_RE = /[.*+?^${}()|[\]\\]/g

function escapeRegExp(value: string) {
  return value.replace(REGEXP_ESCAPE_RE, '\\$&')
}

function createGlobRegExp(pattern: string) {
  return new RegExp(`^${pattern.split('*').map(escapeRegExp).join('.*')}$`)
}

export function isOutputFilePattern(file: string) {
  return GLOB_TOKEN_RE.test(path.basename(file))
}

export function isOutputFileCandidate(file: string) {
  return !VIRTUAL_OUTPUT_ID_RE.test(file)
}

export function isPendingOutputError(error: unknown) {
  const code = (error as NodeJS.ErrnoException | undefined)?.code
  return code === 'ENOENT' || code === 'ENOTDIR' || code === 'EPERM' || code === 'EBUSY' || code === 'EACCES'
}

export async function expandOutputFileEntries(
  files: string[],
  options: { presenceOnly?: boolean, ensureActive?: () => void } = {},
) {
  const resolved = new Set<string>()

  for (const file of files) {
    options.ensureActive?.()
    if (!isOutputFileCandidate(file)) {
      continue
    }

    if (!isOutputFilePattern(file)) {
      if (options.presenceOnly) {
        try {
          const info = await stat(file)
          options.ensureActive?.()
          if (info.isFile()) {
            resolved.add(file)
          }
        }
        catch (error) {
          options.ensureActive?.()
          if (!isPendingOutputError(error)) {
            throw error
          }
        }
        continue
      }
      const content = await readFileIfExists(file)
      if (content != null) {
        resolved.add(file)
      }
      continue
    }

    const dir = path.dirname(file)
    const pattern = createGlobRegExp(path.basename(file))
    let entries: string[] = []

    try {
      entries = await readdir(dir)
    }
    catch (error) {
      options.ensureActive?.()
      if (options.presenceOnly && !isPendingOutputError(error)) {
        throw error
      }
      continue
    }
    options.ensureActive?.()

    for (const entry of entries) {
      options.ensureActive?.()
      if (!pattern.test(entry)) {
        continue
      }
      const matchedFile = path.join(dir, entry)
      if (options.presenceOnly) {
        try {
          const info = await stat(matchedFile)
          options.ensureActive?.()
          if (info.isFile()) {
            resolved.add(matchedFile)
          }
        }
        catch (error) {
          options.ensureActive?.()
          if (!isPendingOutputError(error)) {
            throw error
          }
        }
        continue
      }
      const content = await readFileIfExists(matchedFile)
      if (content != null) {
        resolved.add(matchedFile)
      }
    }
  }

  return [...resolved]
}
