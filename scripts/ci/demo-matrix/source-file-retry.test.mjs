import { mkdtemp, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { setTimeout } from 'node:timers/promises'
import { afterEach, expect, it, vi } from 'vitest'
import { replaceSourceFile } from './source-file.mjs'

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, rename: vi.fn(actual.rename) }
})
vi.mock('node:timers/promises', () => ({ setTimeout: vi.fn(async () => {}) }))

afterEach(() => {
  vi.restoreAllMocks()
  vi.mocked(rename).mockReset()
  vi.mocked(setTimeout).mockClear()
})

async function withSource(run) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'demo-source-retry-'))
  const file = path.join(dir, 'entry.uvue')
  try {
    await writeFile(file, 'original')
    await run(file, dir)
  }
  finally {
    await rm(dir, { recursive: true, force: true })
  }
}

it.each(['EPERM', 'EACCES', 'EBUSY'])('retries a transient Windows %s without exposing incomplete source', async (code) => {
  vi.spyOn(os, 'platform').mockReturnValue('win32')
  const actual = await vi.importActual('node:fs/promises')
  await withSource(async (file, dir) => {
    const temporaries = new Set()
    vi.mocked(rename).mockImplementation(async (temporary, destination) => {
      temporaries.add(temporary)
      expect(await readFile(file, 'utf8')).toBe('original')
      expect(await readFile(temporary, 'utf8')).toBe('replacement')
      if (vi.mocked(rename).mock.calls.length <= 2) {
        throw Object.assign(new Error('file in use'), { code })
      }
      await actual.rename(temporary, destination)
    })
    await replaceSourceFile(file, 'replacement')
    expect(await readFile(file, 'utf8')).toBe('replacement')
    expect(temporaries.size).toBe(1)
    expect(await readdir(dir)).toEqual(['entry.uvue'])
    expect(setTimeout).toHaveBeenCalledTimes(2)
  })
})

it.each([
  ['win32', 'EPERM', 21],
  ['win32', 'ENOENT', 1],
  ['linux', 'EPERM', 1],
  ['darwin', 'EACCES', 1],
])('preserves the original and reports persistent %s %s errors', async (platform, code, attempts) => {
  vi.spyOn(os, 'platform').mockReturnValue(platform)
  const error = Object.assign(new Error('cannot rename'), { code })
  vi.mocked(rename).mockRejectedValue(error)
  await withSource(async (file, dir) => {
    await expect(replaceSourceFile(file, 'replacement')).rejects.toBe(error)
    expect(await readFile(file, 'utf8')).toBe('original')
    expect(await readdir(dir)).toEqual(['entry.uvue'])
    expect(rename).toHaveBeenCalledTimes(attempts)
    expect(setTimeout).toHaveBeenCalledTimes(attempts - 1)
  })
})
