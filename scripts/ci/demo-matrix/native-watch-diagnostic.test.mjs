import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { execa } from 'execa'
import { expect, it } from 'vitest'
import { repo } from './catalog.mjs'

it('原生监听诊断保留事件与关闭生命周期并记录文件身份', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'native-watch-diagnostic-'))
  const file = path.join(dir, 'entry.js')
  try {
    await writeFile(file, 'before')
    const { stdout } = await execa(process.execPath, [
      '--require',
      path.join(repo, 'scripts/ci/demo-matrix/native-watch-diagnostic.cjs'),
      '--input-type=module',
      '-e',
      `
        import fs from 'node:fs'
        import { once } from 'node:events'
        const file = process.env.DEMO_MATRIX_NATIVE_WATCH_FILE
        const watcher = fs.watch(file, () => {})
        const event = once(watcher, 'change')
        setImmediate(() => fs.writeFileSync(file, 'after'))
        await event
        const closed = once(watcher, 'close')
        watcher.close()
        await closed
      `,
    ], { env: { DEMO_MATRIX_NATIVE_WATCH_FILE: file }, timeout: 5000 })
    const events = stdout.trim().split('\n').map(line => JSON.parse(line.replace('[native-watch] ', '')))
    expect(events[0]).toMatchObject({ event: 'bind', file, state: { size: 6 } })
    expect(events.some(event => event.event === 'event' && event.state.size === 5)).toBe(true)
    expect(events.at(-1)).toMatchObject({ event: 'close', id: events[0].id })
  }
  finally { await rm(dir, { recursive: true, force: true }) }
})

it('记录递归祖先上的 EventEmitter 监听，不吞掉调用方事件或记录无关文件', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'native-recursive-diagnostic-'))
  const file = path.join(dir, 'src', 'entry.js')
  try {
    await mkdir(path.dirname(file))
    await writeFile(file, 'source')
    const { stdout } = await execa(process.execPath, ['-e', `
      const fs = require('node:fs')
      const path = require('node:path')
      const { EventEmitter } = require('node:events')
      const { pathToFileURL } = require('node:url')
      const emitter = new EventEmitter()
      fs.watch = () => emitter
      require(process.env.DIAGNOSTIC_MODULE)
      const base = process.env.DIAGNOSTIC_ROOT
      const file = process.env.DEMO_MATRIX_NATIVE_WATCH_FILE
      const watcher = fs.watch(pathToFileURL(base), { recursive: true })
      let delivered = 0
      watcher.on('change', () => delivered++)
      watcher.emit('change', 'rename', Buffer.from(path.relative(base, file)))
      watcher.emit('change', 'rename', path.join('unrelated', 'entry.js'))
      watcher.emit('close')
      if (watcher !== emitter || delivered !== 2) throw new Error('调用方事件被改变')
    `], { env: { DEMO_MATRIX_NATIVE_WATCH_FILE: file, DIAGNOSTIC_ROOT: dir, DIAGNOSTIC_MODULE: path.join(repo, 'scripts/ci/demo-matrix/native-watch-diagnostic.cjs') }, timeout: 5000 })
    const events = stdout.trim().split('\n').filter(Boolean).map(line => JSON.parse(line.replace('[native-watch] ', '')))
    expect(events.map(event => event.event)).toEqual(['bind', 'event', 'close'])
    expect(events[1].state.size).toBe(6)
  }
  finally { await rm(dir, { recursive: true, force: true }) }
})
