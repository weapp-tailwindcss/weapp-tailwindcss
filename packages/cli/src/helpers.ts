import { mkdir } from 'node:fs/promises'
import process from 'node:process'
import { logger } from '@weapp-tailwindcss/logger'
import {
  normalizeExtractFormat,
  normalizeTokenFormat,
  readStringArrayOption,
  readStringOption,
  resolveCliCwd,
  toBoolean,
} from './helpers/options'

export async function ensureDir(dir: string) {
  await mkdir(dir, { recursive: true })
}

function handleCliError(error: unknown) {
  if (error instanceof Error) {
    logger.error(error.message)
    if (error.stack && process.env['WEAPP_TW_DEBUG'] === '1') {
      logger.error(error.stack)
    }
  }
  else {
    logger.error(String(error))
  }
}

export function commandAction<T extends unknown[]>(handler: (...args: T) => Promise<void>) {
  return async (...args: T) => {
    try {
      await handler(...args)
    }
    catch (error) {
      handleCliError(error)
      process.exitCode = 1
    }
  }
}

export {
  normalizeExtractFormat,
  normalizeTokenFormat,
  readStringArrayOption,
  readStringOption,
  resolveCliCwd,
  toBoolean,
}
