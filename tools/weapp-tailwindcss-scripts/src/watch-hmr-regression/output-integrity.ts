import type { OutputIntegrityGuard } from './types'
import { Buffer } from 'node:buffer'
import { unwatchFile, watchFile } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { formatPath } from './cli'
import { collectEmptyCssBlocks } from './css-integrity'

const OUTPUT_INTEGRITY_CONFIRMATION_MS = 10
const STYLE_OUTPUT_EXTENSION_RE = /\.(?:acss|css|jxss|qss|ttss|wxss)$/i

interface OutputIntegrityViolation {
  bytes: number
  excerpt: string
  file: string
  forbiddenFragment: string
  observedAt: number
}

async function collectStyleOutputFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => [])
  const files = await Promise.all(entries.map(async (entry) => {
    const file = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      return collectStyleOutputFiles(file)
    }
    return entry.isFile() && STYLE_OUTPUT_EXTENSION_RE.test(entry.name) ? [file] : []
  }))
  return files.flat()
}

async function resolveGuardFiles(guard: OutputIntegrityGuard) {
  if (guard.file) {
    return [guard.file]
  }
  if (guard.directory) {
    return collectStyleOutputFiles(guard.directory)
  }
  return []
}

export function createOutputIntegrityMonitor(guards: OutputIntegrityGuard[] | undefined) {
  if (!guards || guards.length === 0) {
    return undefined
  }

  const violations = new Map<string, OutputIntegrityViolation>()
  let pendingInspection = Promise.resolve()
  const inspect = async (guard: OutputIntegrityGuard) => {
    for (const file of await resolveGuardFiles(guard)) {
      const content = await readFile(file, 'utf8').catch(() => undefined)
      if (content === undefined) {
        continue
      }
      const matchedFragments = (guard.forbiddenFragments ?? []).filter(forbiddenFragment => content.includes(forbiddenFragment))
      if (guard.forbidEmptyBlockAtRules) {
        matchedFragments.push(...collectEmptyCssBlocks(content))
      }
      if (matchedFragments.length === 0) {
        continue
      }
      await delay(OUTPUT_INTEGRITY_CONFIRMATION_MS)
      const confirmedContent = await readFile(file, 'utf8').catch(() => undefined)
      if (confirmedContent === undefined) {
        continue
      }
      for (const forbiddenFragment of matchedFragments) {
        if (!confirmedContent.includes(forbiddenFragment)) {
          continue
        }
        const key = `${file}\0${forbiddenFragment}`
        const fragmentIndex = confirmedContent.indexOf(forbiddenFragment)
        violations.set(key, {
          bytes: Buffer.byteLength(confirmedContent),
          excerpt: confirmedContent.slice(
            Math.max(0, fragmentIndex - 80),
            Math.min(confirmedContent.length, fragmentIndex + forbiddenFragment.length + 160),
          ),
          file,
          forbiddenFragment,
          observedAt: Date.now(),
        })
      }
    }
  }
  const queueInspection = (guard: OutputIntegrityGuard) => {
    pendingInspection = pendingInspection
      .then(() => inspect(guard))
      .catch(() => {})
  }

  for (const guard of guards) {
    if (guard.file) {
      watchFile(guard.file, {
        interval: 10,
        persistent: false,
      }, () => queueInspection(guard))
    }
    queueInspection(guard)
  }

  const createError = (phase: string) => {
    const violation = violations.values().next().value as OutputIntegrityViolation | undefined
    if (!violation) {
      return undefined
    }
    return new Error(
      `output integrity violation during ${phase}: ${formatPath(violation.file)} contained ${JSON.stringify(violation.forbiddenFragment)} at ${new Date(violation.observedAt).toISOString()} bytes=${violation.bytes} excerpt=${JSON.stringify(violation.excerpt)}`,
    )
  }

  return {
    async assertClean(phase: string) {
      for (const guard of guards) {
        queueInspection(guard)
      }
      await pendingInspection
      const error = createError(phase)
      if (error) {
        throw error
      }
    },
    async stop() {
      for (const guard of guards) {
        if (guard.file) {
          unwatchFile(guard.file)
        }
        queueInspection(guard)
      }
      await pendingInspection
    },
  }
}
