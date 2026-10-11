import { once } from 'node:events'
import fs from 'node:fs'
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { expect, it, vi } from 'vitest'
import { watchRoots } from '../../../demo/gulp-tailwindcss-v4/watch-roots.mjs'
import { repo } from './catalog.mjs'
import { replaceSourceFile } from './source-file.mjs'

it('Gulp 清空临时目录后，ready 必须晚于深层源码监听绑定且首次原子保存可见', async () => {
  const require = createRequire(path.join(repo, 'demo', 'gulp-tailwindcss-v4', 'package.json'))
  const gulp = require('gulp')
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'gulp-watch-ready-')))
  const source = path.join(root, 'src')
  const file = path.join(source, 'pages', 'index', 'index.ttml')
  const temporary = path.join(root, 'tmp', 'assets', 'images')
  let watcher
  const bound = new Set()
  const watch = fs.watch
  const spy = vi.spyOn(fs, 'watch').mockImplementation(function (file, ...args) {
    bound.add(path.resolve(String(file)))
    return watch.call(this, file, ...args)
  })
  try {
    await mkdir(path.dirname(file), { recursive: true })
    await writeFile(file, '<view>initial</view>')
    for (let round = 0; round < 8; round++) {
      bound.clear()
      await rm(path.join(root, 'tmp'), { recursive: true, force: true })
      watcher = await watchRoots(gulp.watch.bind(gulp), [source, temporary], {
        ignored: /[/\\]\\./,
        ignoreInitial: true,
        useFsEvents: false,
        usePolling: false,
      })
      await once(watcher, 'ready')
      expect(bound.has(file)).toBe(true)
      const changed = once(watcher, 'change')
      await replaceSourceFile(file, `<view>${round}</view>`)
      expect(path.resolve((await changed)[0])).toBe(file)
      await watcher.close()
    }
  }
  finally {
    await watcher?.close()
    spy.mockRestore()
    await rm(root, { recursive: true, force: true })
  }
}, 20_000)
