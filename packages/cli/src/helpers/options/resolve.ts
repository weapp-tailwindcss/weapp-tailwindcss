import path from 'node:path'
import process from 'node:process'
import { readStringOption } from './parse'

export function resolveCliCwd(value: unknown): string | undefined {
  const raw = readStringOption('cwd', value)
  if (!raw) {
    return undefined
  }
  return path.isAbsolute(raw) ? path.normalize(raw) : path.resolve(process.cwd(), raw)
}
