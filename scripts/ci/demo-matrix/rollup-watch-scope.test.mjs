import { mkdtemp, readFile, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { setImmediate as nextTurn } from 'node:timers/promises'
import { pathToFileURL } from 'node:url'
import { expect, it, vi } from 'vitest'
import { rollupTestRequire } from './rollup-test-runtime.mjs'
import { watchRunScope, withWatchCleanup } from './rollup-watch-scope.mjs'
import { replaceSourceFile } from './source-file.mjs'

const cases = ['cjs', 'esm'].flatMap(format => ['generateBundle', 'closeBundle'].map(hook => ({ format, hook })))

it.each(cases)('夹具清理等待自己拥有的输出与 bundle 关闭 ($format, $hook)', async ({ format, hook }) => {
  const require = rollupTestRequire('uni-app-vite-tailwindcss-v4')
  const rollup = format === 'cjs' ? require('rollup') : await import(pathToFileURL(path.join(path.dirname(require.resolve('rollup')), 'es/rollup.js')).href)
  const directory = await realpath(await mkdtemp(path.join(tmpdir(), 'rollup-owned-output-')))
  const entry = path.join(directory, 'entry.js')
  const output = path.join(directory, 'bundle.mjs')
  const entered = Promise.withResolvers()
  const release = Promise.withResolvers()
  const hookFinished = Promise.withResolvers()
  const outputFinished = Promise.withResolvers()
  const closeEntered = Promise.withResolvers()
  const cleanup = vi.fn(async () => {})
  let watcher
  let pending
  try {
    await replaceSourceFile(entry, 'export const value = 7')
    watcher = rollup.watch({
      input: entry,
      output: { file: output, format: 'es' },
      plugins: [{
        name: 'owned-output-barrier',
        async [hook]() {
          entered.resolve()
          await release.promise
          hookFinished.resolve()
        },
        writeBundle() {
          outputFinished.resolve()
        },
      }],
    })
    const close = watchRunScope(watcher)
    watcher.on('close', () => {
      closeEntered.resolve()
    })
    await entered.promise
    pending = withWatchCleanup(async () => 'body complete', close, cleanup)
    await closeEntered.promise
    // 只推进一轮事件循环；输出/closeBundle 的显式门闩仍关闭。
    expect(await Promise.race([pending.then(() => 'disposed'), nextTurn().then(() => 'waiting')])).toBe('waiting')
    expect(cleanup).not.toHaveBeenCalled()
    release.resolve()
    expect(await pending).toBe('body complete')
    expect(cleanup).toHaveBeenCalledOnce()
    expect(await readFile(output, 'utf8')).toContain('value = 7')
  }
  finally {
    release.resolve()
    await hookFinished.promise
    await outputFinished.promise
    await pending
    await watcher?.close()
    await rm(directory, { recursive: true, force: true })
  }
}, 10_000)

it('主体、关闭与删除的异常全部保留，单个主体异常保持原对象', async () => {
  const original = new Error('original assertion')
  const close = new Error('close failed')
  const remove = new Error('remove failed')
  const fail = error => async () => {
    throw error
  }
  await expect(withWatchCleanup(fail(original), async () => {}, async () => {})).rejects.toBe(original)
  await expect(withWatchCleanup(fail(original), fail(close), fail(remove))).rejects.toMatchObject({ errors: [original, close, remove] })
})

it.each(['cjs', 'esm'])('bundle 关闭失败仍排空本轮，重复关闭保留同一失败 ($0)', async (format) => {
  const require = rollupTestRequire('uni-app-vite-tailwindcss-v4')
  const rollup = format === 'cjs' ? require('rollup') : await import(pathToFileURL(path.join(path.dirname(require.resolve('rollup')), 'es/rollup.js')).href)
  const directory = await realpath(await mkdtemp(path.join(tmpdir(), 'rollup-close-error-')))
  const entry = path.join(directory, 'entry.js')
  const original = new Error('owned closeBundle failed')
  const closeBundle = vi.fn(async () => {
    throw original
  })
  const ended = Promise.withResolvers()
  let close
  try {
    await replaceSourceFile(entry, 'export const value = 7')
    const watcher = rollup.watch({
      input: entry,
      output: { file: path.join(directory, 'bundle.mjs'), format: 'es' },
      plugins: [{ name: 'owned-close-error', closeBundle }],
    })
    close = watchRunScope(watcher)
    watcher.on('event', (event) => {
      if (event.code === 'END') {
        ended.resolve()
      }
    })
    await ended.promise
    const first = close()
    expect(close()).toBe(first)
    await expect(first).rejects.toBe(original)
    expect(closeBundle).toHaveBeenCalledOnce()
  }
  finally {
    await withWatchCleanup(async () => {}, async () => {
      // 上面已验证关闭失败；此处只收尾同一关闭 Promise。
      await close?.().catch((error) => {
        if (error !== original) {
          throw error
        }
      })
    }, () => rm(directory, { recursive: true, force: true }))
  }
}, 10_000)
