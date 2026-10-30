import { once } from 'node:events'
import process from 'node:process'
import { execa } from 'execa'
import { describe, expect, it } from 'vitest'
import { complete } from './process.mjs'

describe('build completion failure evidence', () => {
  it('preserves the original process error and stderr for a nonzero exit', async () => {
    const result = await execa(process.execPath, ['-e', 'console.error("compiler failed"); process.exit(7)'], { reject: false })
    expect(result.failed).toBe(true)
    await expect(complete({ done: Promise.resolve(result), log: () => result.stderr })).rejects.toBe(result)
    expect(result.exitCode).toBe(7)
    expect(result.stderr).toContain('compiler failed')
  })

  it('preserves the termination signal when no exit code is available', async () => {
    const child = execa(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { reject: false })
    try {
      await once(child, 'spawn')
      child.kill('SIGTERM')
      const result = await child
      expect(result.failed).toBe(true)
      expect(result.exitCode).toBeUndefined()
      expect(result.signal).toBe('SIGTERM')
      await expect(complete({ done: Promise.resolve(result), log: () => result.stderr })).rejects.toBe(result)
    }
    finally {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGKILL')
      }
      await child
    }
  })
})
