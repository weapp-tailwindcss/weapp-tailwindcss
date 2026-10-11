import { watch } from 'node:fs'
import { chmod, mkdtemp, readdir, readFile, realpath, rm, stat } from 'node:fs/promises'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { expect, it, vi } from 'vitest'
import { repo } from './catalog.mjs'
import { replaceSourceFile } from './source-file.mjs'

it('publishes complete source revisions to a real watcher across consecutive replacements', async () => {
  const dir = await realpath(await mkdtemp(path.join(os.tmpdir(), 'demo-source-')))
  const file = path.join(dir, 'entry.vue')
  const revisions = Array.from({ length: 5 }, (_, round) => `<template>${String(round).repeat(2 ** 21)}</template>`)
  const reads = []
  let watcher
  try {
    await replaceSourceFile(file, revisions[0])
    await chmod(file, 0o644)
    watcher = watch(dir, (_, name) => {
      if (name === path.basename(file)) {
        reads.push(readFile(file, 'utf8'))
      }
    })
    for (const revision of revisions.slice(1)) {
      const offset = reads.length
      await replaceSourceFile(file, revision)
      await expect.poll(async () => (await Promise.all(reads.slice(offset))).includes(revision)).toBe(true)
    }
    watcher.close()
    expect(reads.length).toBeGreaterThanOrEqual(revisions.length - 1)
    for (const observed of await Promise.all(reads)) {
      expect(revisions.includes(observed)).toBe(true)
    }
    expect(await readFile(file, 'utf8')).toBe(revisions.at(-1))
    expect(await readdir(dir)).toEqual(['entry.vue'])
    if (process.platform !== 'win32') {
      expect((await stat(file)).mode & 0o777).toBe(0o644)
    }
  }
  finally {
    watcher?.close()
    await rm(dir, { recursive: true, force: true })
  }
})

it('keeps Rollup file watchers attached through consecutive revisions', async () => {
  const demoRequire = createRequire(path.join(repo, 'demo/uni-app-vite-tailwindcss-v4/package.json'))
  const viteRequire = createRequire(demoRequire.resolve('vite/package.json'))
  const rollup = viteRequire('rollup')
  const directory = await realpath(await mkdtemp(path.join(os.tmpdir(), 'demo-source-rollup-')))
  const file = path.join(directory, 'entry.js')
  const output = path.join(directory, 'bundle.js')
  const platform = vi.spyOn(os, 'platform').mockReturnValue('linux')
  let watcher
  let builds = 0
  try {
    await replaceSourceFile(file, 'export const value = "initial"')
    watcher = rollup.watch({ input: file, output: { file: output, format: 'es' }, watch: { chokidar: { useFsEvents: false } } })
    watcher.on('event', (event) => {
      if (event.code === 'BUNDLE_END') {
        builds++
        void event.result.close()
      }
    })
    await expect.poll(() => builds).toBe(1)
    for (const revision of ['replace', 'add', 'restore']) {
      const previous = builds
      await replaceSourceFile(file, `export const value = "${revision}"`)
      await expect.poll(() => builds, { timeout: 5000 }).toBeGreaterThan(previous)
      expect(await readFile(output, 'utf8')).toContain(`"${revision}"`)
    }
  }
  finally {
    await watcher?.close()
    platform.mockRestore()
    await rm(directory, { recursive: true, force: true })
  }
}, 20_000)
