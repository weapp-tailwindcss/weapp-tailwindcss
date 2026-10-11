import { stat } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const loggerError = vi.hoisted(() => vi.fn())

vi.mock('@weapp-tailwindcss/logger', () => ({
  logger: {
    error: loggerError,
  },
}))

describe('cli helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env['WEAPP_TW_DEBUG']
    process.exitCode = undefined
  })

  it('creates directories recursively', async () => {
    const { ensureDir } = await import('@/helpers')
    const dir = path.join(os.tmpdir(), `weapp-tw-cli-${Date.now()}`, 'nested')

    await ensureDir(dir)

    expect((await stat(dir)).isDirectory()).toBe(true)
  })

  it('wraps successful command handlers without changing exit code', async () => {
    const { commandAction } = await import('@/helpers')
    const handler = vi.fn(async (_value: string) => {})
    const action = commandAction(handler)

    await action('ok')

    expect(handler).toHaveBeenCalledWith('ok')
    expect(loggerError).not.toHaveBeenCalled()
    expect(process.exitCode).toBeUndefined()
  })

  it('logs error messages and sets exit code when command handlers fail', async () => {
    const { commandAction } = await import('@/helpers')
    const action = commandAction(async () => {
      throw new Error('failed command')
    })

    await action()

    expect(loggerError).toHaveBeenCalledWith('failed command')
    expect(process.exitCode).toBe(1)
  })

  it('logs stack traces only when debug mode is enabled', async () => {
    const { commandAction } = await import('@/helpers')
    process.env['WEAPP_TW_DEBUG'] = '1'
    const error = new Error('debug failure')
    error.stack = 'debug stack'
    const action = commandAction(async () => {
      throw error
    })

    await action()

    expect(loggerError).toHaveBeenCalledWith('debug failure')
    expect(loggerError).toHaveBeenCalledWith('debug stack')
    expect(process.exitCode).toBe(1)
  })

  it('logs non-error thrown values', async () => {
    const { commandAction } = await import('@/helpers')
    const action = commandAction(async () => {
      throw 'string failure'
    })

    await action()

    expect(loggerError).toHaveBeenCalledWith('string failure')
    expect(process.exitCode).toBe(1)
  })
})
