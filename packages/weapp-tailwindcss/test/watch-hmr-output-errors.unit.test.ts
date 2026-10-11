import type { CliOptions, WatchCase, WatchSession } from '../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/types'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { waitForOutputFilesUpdated } from '../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/mutations/shared'

const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'watch-output-errors-'))
  roots.push(root)
  const output = path.join(root, 'main.wxss')
  const dependency = path.join(root, 'missing.wxss')
  await writeFile(output, '@import "./missing.wxss";')
  return {
    dependency,
    wait: (acceptWhen: () => Promise<boolean>, ensureRunning = () => {}) => waitForOutputFilesUpdated(
      { label: 'import graph' } as WatchCase,
      [output],
      new Map([[output, 0]]),
      { timeoutMs: 100, pollMs: 1 } as CliOptions,
      { ensureRunning } as WatchSession,
      Date.now(),
      acceptWhen,
    ),
  }
}

describe('watch output validation failures', () => {
  it('retains the missing imported file and original error after the bounded wait', async () => {
    const { dependency, wait } = await fixture()
    const error = await wait(async () => {
      await readFile(dependency)
      return true
    }).catch(error => error)
    expect(error.message).toContain('output files were not updated')
    expect(error.message).toContain(dependency)
    expect(error.cause).toMatchObject({ code: 'ENOENT', path: dependency })
  })

  it('allows a temporarily missing dependency to become available', async () => {
    const { dependency, wait } = await fixture()
    let attempts = 0
    await expect(wait(async () => {
      if (++attempts === 2) {
        await writeFile(dependency, '.ready{}')
      }
      return (await readFile(dependency, 'utf8')).includes('.ready')
    })).resolves.toBeGreaterThanOrEqual(0)
    expect(attempts).toBe(2)
  })

  it('clears a stale read error once reading recovers but the expected output remains absent', async () => {
    const { wait } = await fixture()
    let attempts = 0
    const error = await wait(async () => {
      if (++attempts === 1) {
        throw new Error('temporary read failure')
      }
      return false
    }).catch(error => error)
    expect(error.message).not.toContain('temporary read failure')
    expect(error.cause).toBeUndefined()
  })

  it('preserves a watcher exit instead of replacing it with a preceding read error', async () => {
    const { wait } = await fixture()
    let attempted = false
    const exit = new Error('compiler exited')
    await expect(wait(async () => {
      attempted = true
      throw new Error('temporary read failure')
    }, () => {
      if (attempted) {
        throw exit
      }
    })).rejects.toBe(exit)
  })
})
