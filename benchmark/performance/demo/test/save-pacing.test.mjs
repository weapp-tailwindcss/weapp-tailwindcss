import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { EventEmitter, on, once } from 'node:events'
import { watch } from 'chokidar'
import { expect, it } from 'vitest'
import { replaceSourceFile } from '../../../../scripts/ci/demo-matrix/source-file.mjs'
import { createSavePacer, interSaveQuietMs } from '../save-pacing.mjs'

async function nextSourceChange(watcher, file) {
  // Linux 会同时报告原子写入的临时文件；必须等待目标源码自己的事件。
  for await (const [updated] of on(watcher, 'change', { signal: AbortSignal.timeout(2000) })) {
    if (path.resolve(updated) === file) {
      return updated
    }
  }
}

it('临时文件先触发 change 时仍等待目标事件，并移除监听器', async () => {
  const watcher = new EventEmitter()
  const file = path.resolve('entry.js')
  const changed = nextSourceChange(watcher, file)
  watcher.emit('change', path.resolve('.entry.js.tmp'))
  watcher.emit('change', file)
  expect(await changed).toBe(file)
  expect(watcher.listenerCount('change')).toBe(0)
  expect(watcher.listenerCount('error')).toBe(0)
})

it('真实 watcher 连续原子保存逐次收到当前内容，保存间隔发生在计时开始之前', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'cost-save-pacing-'))
  const file = path.join(root, 'entry.js')
  await writeFile(file, 'initial')
  const watcher = watch(root, { ignoreInitial: true, useFsEvents: false })
  try {
    await once(watcher, 'ready')
    let settledAt = performance.now()
    const pacer = createSavePacer()
    for (let round = 0; round < 4; round++) {
      await pacer.beforeSave()
      expect(performance.now() - settledAt).toBeGreaterThanOrEqual(interSaveQuietMs)
      const changed = nextSourceChange(watcher, file)
      const began = performance.now()
      await replaceSourceFile(file, `marker-${round}`)
      const updated = await changed
      expect(path.resolve(updated)).toBe(file)
      expect(await readFile(file, 'utf8')).toBe(`marker-${round}`)
      expect(performance.now()).toBeGreaterThanOrEqual(began)
      settledAt = performance.now()
      pacer.settled()
    }
  }
  finally { await watcher.close(); await rm(root, { recursive: true, force: true }) }
})
