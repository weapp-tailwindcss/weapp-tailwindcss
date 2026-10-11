import type { RollupWatcher } from 'rollup'
import type { Plugin } from 'vite'
import { EventEmitter } from 'node:events'
import { access, mkdir, mkdtemp, readFile, realpath, rm, unlink, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { build } from 'vite'
import { afterEach, describe, expect, it } from 'vitest'
import { WeappTailwindcss } from '@/bundlers/vite'
import { replaceWxml } from '@/wxml'

const require = createRequire(import.meta.url)
const tailwindcssBasedir = path.dirname(require.resolve('tailwindcss/package.json'))
const createdDirs: string[] = []
const closeWatchers: Array<() => Promise<void>> = []
const rawCandidate = 'pt-[12rpx]'
const transformedCandidate = replaceWxml(rawCandidate)

function waitForWatch(watcher: RollupWatcher, signal: AbortSignal, options: { deletedFile?: string, written?: Promise<void> } = {}) {
  return new Promise<void>((resolve, reject) => {
    signal.throwIfAborted()
    let observedChange = options.deletedFile === undefined
    const onChange = (id: string, change: { event: string }) => {
      if (id === options.deletedFile && change.event === 'delete') {
        observedChange = true
      }
    }
    const onEvent = (event: { code: string, error?: unknown }) => {
      if (event.code === 'ERROR') {
        cleanup()
        reject(event.error instanceof Error ? event.error : new Error(String(event.error)))
        return
      }
      if (event.code === 'END' && observedChange && !options.written) {
        cleanup()
        resolve()
      }
    }
    const onAbort = () => {
      cleanup()
      reject(signal.reason)
    }
    const cleanup = () => {
      watcher.off('event', onEvent)
      watcher.off('change', onChange)
      signal.removeEventListener('abort', onAbort)
    }
    signal.addEventListener('abort', onAbort, { once: true })
    watcher.on('change', onChange)
    watcher.on('event', onEvent)
    options.written?.then(() => {
      cleanup()
      resolve()
    }, (error) => {
      cleanup()
      reject(error)
    })
  })
}

function emitWatchedTemplate(templateFile: string, templateOutput: string): Plugin {
  return {
    name: 'emit-watched-anonymous-template',
    async buildStart() {
      this.addWatchFile(templateFile)
      try {
        const source = await readFile(templateFile, 'utf8')
        this.emitFile({
          type: 'asset',
          fileName: templateOutput,
          source,
        })
      }
      catch (error) {
        if ((error as { code?: string }).code !== 'ENOENT') {
          throw error
        }
      }
    },
  }
}

async function createFixtureRoot(explicitSource: boolean, extension: string) {
  // 与 Rollup 的模块身份一致，避免 macOS 临时目录符号链接产生双路径通知。
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'weapp-tailwindcss-vite-template-delete-')))
  createdDirs.push(root)
  const viewsDir = path.join(root, 'views')
  await mkdir(viewsDir, { recursive: true })
  const cssFile = path.join(root, 'app.css')
  const templateOutput = `views/card.${extension}`
  const templateFile = path.join(viewsDir, `card.${extension}`)
  await Promise.all([
    writeFile(path.join(root, 'app.ts'), 'import "./app.css"\n'),
    writeFile(cssFile, [
      '@import "tailwindcss";',
      explicitSource ? `@source "./${templateOutput}";` : '',
      '',
    ].join('\n')),
    writeFile(templateFile, `<view class="${rawCandidate}">card</view>\n`),
  ])
  return {
    cssFile,
    root,
    templateFile,
    templateOutput,
  }
}

describe('bundlers/vite template delete watch', () => {
  afterEach(async () => {
    // 测试超时同样先完成 watcher 收尾，再删除它监听的目录。
    await Promise.all(closeWatchers.splice(0).map(close => close()))
    await Promise.all(createdDirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })))
  })

  it.each([false, true])('等待写盘=$written 时响应错误和取消，并释放监听', async (written) => {
    for (const failure of ['error', 'abort'] as const) {
      const events = new EventEmitter()
      const controller = new AbortController()
      const barrier = Promise.withResolvers<void>()
      const pending = waitForWatch(events as unknown as RollupWatcher, controller.signal, {
        written: written ? barrier.promise : undefined,
      })
      const error = new Error(failure)
      if (failure === 'error') {
        events.emit('event', { code: 'ERROR', error })
      }
      else {
        controller.abort(error)
      }
      await expect(pending).rejects.toBe(error)
      expect(events.listenerCount('event')).toBe(0)
      expect(events.listenerCount('change')).toBe(0)
      barrier.resolve()
    }
  })

  const cases = [true, false].flatMap(explicit => ['axml', 'qxml'].flatMap(extension => [false, true].map(inFlight => ({ explicit, extension, inFlight }))))
  it.for(cases)('removes anonymous $extension candidates with explicit source=$explicit and previous build in flight=$inFlight', async ({ explicit, extension, inFlight }, { signal }) => {
    const { cssFile, root, templateFile, templateOutput } = await createFixtureRoot(explicit, extension)
    const distCssFile = path.join(root, 'dist/app.css')
    let emittedStyles = new Map<string, string>()
    let holdNextWrite = false
    const previousBuildWritten = Promise.withResolvers<void>()
    const releasePreviousBuild = Promise.withResolvers<void>()
    const watcher = await build({
      root,
      logLevel: 'silent',
      plugins: [
        emitWatchedTemplate(templateFile, templateOutput),
        ...WeappTailwindcss({
          appType: 'weapp-vite',
          cssEntries: [cssFile],
          generator: {
            hmr: {
              preserveDeletedCss: false,
            },
          },
          tailwindcssBasedir,
          tailwindcss: {
            packageName: 'tailwindcss',
            v4: {
              cssEntries: [cssFile],
            },
          },
        }) ?? [],
        {
          name: 'inspect-emitted-style-identity',
          writeBundle: {
            order: 'post',
            async handler(_options, bundle) {
              emittedStyles = new Map(Object.entries(bundle).flatMap(([file, output]) =>
                output.type === 'asset' && /\.(?:css|wxss|acss)$/.test(file) ? [[file, String(output.source)]] : [],
              ))
              if (holdNextWrite) {
                holdNextWrite = false
                previousBuildWritten.resolve()
                await releasePreviousBuild.promise
              }
            },
          },
        },
      ],
      build: {
        minify: false,
        watch: {},
        rollupOptions: {
          input: path.join(root, 'app.ts'),
          output: {
            assetFileNames: '[name].[ext]',
            chunkFileNames: '[name].js',
            entryFileNames: '[name].js',
          },
        },
      },
    }) as RollupWatcher
    let closing: Promise<void> | undefined
    const close = () => closing ??= (async () => {
      releasePreviousBuild.resolve()
      await watcher.close()
    })()
    closeWatchers.push(close)

    try {
      await waitForWatch(watcher, signal)
      expect(await readFile(distCssFile, 'utf8')).toContain(`.${transformedCandidate}`)
      const emittedTemplate = path.join(root, 'dist', templateOutput)
      await access(emittedTemplate)
      expect(await readFile(emittedTemplate, 'utf8')).toContain(transformedCandidate)

      if (inFlight) {
        // 让上一轮产物已经写入但 END 尚未发出，确定性覆盖删除与在途构建交错。
        holdNextWrite = true
        const previousWrite = waitForWatch(watcher, signal, { written: previousBuildWritten.promise })
        await writeFile(path.join(root, 'app.ts'), 'import "./app.css"\nexport const trigger = 1\n')
        await previousWrite
      }
      const rebuild = waitForWatch(watcher, signal, { deletedFile: templateFile })
      await unlink(templateFile)
      releasePreviousBuild.resolve()
      await rebuild

      expect([...emittedStyles.keys()]).toEqual(['app.css'])
      for (const css of emittedStyles.values()) {
        expect(css).not.toContain(`.${transformedCandidate}`)
      }
      expect(await readFile(distCssFile, 'utf8')).not.toContain(`.${transformedCandidate}`)
    }
    finally {
      await close()
    }
  }, 60_000)
})
