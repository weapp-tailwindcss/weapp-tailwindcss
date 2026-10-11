import path from 'node:path'
import process from 'node:process'
import { execa } from 'execa'
import { expect, it } from 'vitest'
import { repo } from './catalog.mjs'
import { assertGulpWatchBuildComplete, assertMpxWatchBuildComplete, assertTaroWatchBuildComplete, assertUniWatchBuildComplete, assertViteWatchBuildComplete, assertWeappViteWatchReady, developmentEnvironment } from './process.mjs'

it('weapp-vite 首轮产物写出后仍须等待监听初始化完成', () => {
  const outputWritten = '[info] [分包] 分包产物已写出\n'
  const built = `${outputWritten}[success] 小程序初次构建完成，耗时：15051ms\n`
  expect(() => assertWeappViteWatchReady(outputWritten)).toThrow()
  expect(() => assertWeappViteWatchReady(built)).toThrow()
  expect(() => assertWeappViteWatchReady(`${built}[success] 开发服务已就`)).toThrow()
  expect(() => assertWeappViteWatchReady(`${built}\u001B[32m[success] 开发服务已就绪：\u001B[0m\n`)).not.toThrow()
})

it('Mpx 必须完成当前编译才能归档产物，旧轮次与失败状态不能放行', () => {
  const initial = '[info] Compiling Ali-development\n'
  const ready = `${initial}\u001B[32m  Compiled successfully\u001B[0m\n`
  expect(() => assertMpxWatchBuildComplete(initial)).toThrow()
  expect(() => assertMpxWatchBuildComplete(ready)).not.toThrow()
  expect(() => assertMpxWatchBuildComplete(ready, ready.length)).toThrow()
  const pending = `${ready}${initial}`
  expect(() => assertMpxWatchBuildComplete(pending)).toThrow()
  expect(() => assertMpxWatchBuildComplete(`${pending}Compiled with some errors\n`)).toThrow()
  expect(() => assertMpxWatchBuildComplete(`${pending}Compiled with some warnings\n`, ready.length)).not.toThrow()
  expect(() => assertMpxWatchBuildComplete(`${pending}Compiled successfully\n`, ready.length)).not.toThrow()
})

it('waits for Gulp to finish all streams before copying output or starting another edit', () => {
  const initial = '[03:19:19] Finished \'copyWXML\' after 29 ms\n[03:19:19] Starting \'compileTsFiles\'...\n'
  const ready = `${initial}[03:19:20] watching for changes\n`
  const changed = '[03:19:20] src\\pages\\index\\index.ttml is changed\n'
  const copied = '[weapp-tailwindcss:hmr] {"bundler":"gulp","phase":"html","file":"index.ttml"}\n'
  const completed = `${ready}${changed}${copied}[03:19:20] build complete\n`
  expect(() => assertGulpWatchBuildComplete(initial)).toThrow()
  expect(() => assertGulpWatchBuildComplete(ready)).not.toThrow()
  expect(() => assertGulpWatchBuildComplete(ready, ready.length)).toThrow()
  expect(() => assertGulpWatchBuildComplete(`${ready}${changed}${copied}`, ready.length)).toThrow()
  expect(() => assertGulpWatchBuildComplete(completed, ready.length)).not.toThrow()
  for (const event of ['changed', 'added', 'deleted']) {
    expect(() => assertGulpWatchBuildComplete(`${completed}src\\index.ttml is ${event}\n`, ready.length)).toThrow()
  }
  expect(() => assertGulpWatchBuildComplete(`${completed}src\\index.ttml changed failed EBUSY: locked\n`, ready.length)).toThrow()
  expect(() => assertGulpWatchBuildComplete(completed, completed.length)).toThrow()
})

it('waits for uni-app startup and the current incremental compilation', () => {
  const initial = 'Compiling...\nDONE  Build complete. Watching for changes...\n'
  expect(() => assertUniWatchBuildComplete(initial)).toThrow()
  expect(() => assertUniWatchBuildComplete(`${initial}ready in 1000ms.`)).not.toThrow()
  expect(() => assertUniWatchBuildComplete(initial, initial.length)).toThrow()
  expect(() => assertUniWatchBuildComplete(`${initial}Incremental Compiling...`, initial.length)).toThrow()
  expect(() => assertUniWatchBuildComplete(`${initial}Incremental Compiling...\nDONE  Build complete. Watching for changes...`, initial.length)).not.toThrow()
})

it('waits for Taro to resume watching before another source update', () => {
  const initial = 'Compiled successfully in 3s\nWatching...'
  expect(() => assertTaroWatchBuildComplete(initial)).not.toThrow()
  expect(() => assertTaroWatchBuildComplete(initial, initial.length)).toThrow()
  expect(() => assertTaroWatchBuildComplete(`${initial}\nWebpack sealing (92%)`)).toThrow()
  expect(() => assertTaroWatchBuildComplete(`${initial}\nCompiled successfully in 1s`, initial.length)).toThrow()
  expect(() => assertTaroWatchBuildComplete(`${initial}\nCompiled successfully in 1s\nWatching...`, initial.length)).not.toThrow()
})

it('requires this Vite build to finish before reading its output', () => {
  const initial = 'build started...\nbuilt in 500ms.\n'
  expect(() => assertViteWatchBuildComplete(initial)).not.toThrow()
  expect(() => assertViteWatchBuildComplete(initial, initial.length)).toThrow()
  expect(() => assertViteWatchBuildComplete(`${initial}build started...\n`)).toThrow()
  expect(() => assertViteWatchBuildComplete(`${initial}build started...\nEBUSY: locked`)).toThrow()
  expect(() => assertViteWatchBuildComplete(`${initial}build started...\nbuilt in 400ms.\n`, initial.length)).not.toThrow()
})

it('keeps the default virtual-module watcher idle and accepts genuine module updates', async () => {
  const { stdout } = await execa(process.execPath, [path.join(repo, 'scripts/ci/demo-matrix/fixtures/virtual-watch.cjs')], {
    cwd: repo,
    env: developmentEnvironment({}),
  })
  const result = JSON.parse(stdout)
  expect(result.initialBuilds).toBeGreaterThan(0)
  expect(result.updatedBuilds).toBeGreaterThan(result.initialBuilds)
}, 20_000)
