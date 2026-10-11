import type { Compiler } from 'webpack'
import { createRequire } from 'node:module'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { setupWebpackWatchOutputIgnore } from '../../src/bundlers/webpack/shared/create-framework-plugin/watch-output'

const require = createRequire(import.meta.url)
const webpackRequire = createRequire(require.resolve('webpack/package.json'))
const Watchpack = webpackRequire('watchpack')

describe('Webpack output paths at the Watchpack boundary', () => {
  it.each([
    ['/project/dist', path.posix],
    ['/project with spaces/[build]/dist', path.posix],
    [String.raw`C:\project\dist`, path.win32],
    ['C:/project/dist', path.win32],
    [String.raw`C:\project with spaces\[build]\dist`, path.win32],
    [String.raw`\\server\share\project\dist`, path.win32],
    ['relative-output', path],
  ] as const)('ignores the literal output directory %s and its descendants', (outputPath, paths) => {
    const compiler = {
      outputPath,
      options: { watchOptions: { ignored: ['', '**/node_modules/**', '**/.git/**', '**/.cache'] } },
      hooks: {},
    }
    setupWebpackWatchOutputIgnore(compiler as unknown as Compiler)
    const watcher = new Watchpack(compiler.options.watchOptions)
    try {
      const ignored = watcher.watcherOptions.ignored
      const output = paths.resolve(outputPath)
      expect(ignored(output)).toBe(true)
      expect(ignored(paths.join(output, 'nested', 'app.js'))).toBe(true)
      expect(ignored(paths.join(paths.dirname(output), 'src', 'index.ts'))).toBe(false)
      expect(ignored(`${output}-other`)).toBe(false)
      expect(ignored(paths.join(paths.dirname(output), 'node_modules', 'pkg', 'index.js'))).toBe(true)
      expect(ignored(paths.join(paths.dirname(output), '.git', 'index'))).toBe(true)
      expect(ignored(paths.join(paths.dirname(output), '.cache', 'nested', 'entry.js'))).toBe(true)
    }
    finally {
      watcher.close()
    }
  })

  it('preserves Windows path identity across casing and separator changes', () => {
    const compiler = { outputPath: String.raw`C:\Project\dist`, options: { watchOptions: {} }, hooks: {} }
    setupWebpackWatchOutputIgnore(compiler as unknown as Compiler)
    const watcher = new Watchpack(compiler.options.watchOptions)
    try {
      expect(watcher.watcherOptions.ignored('c:/project/dist/app.js')).toBe(true)
      expect(watcher.watcherOptions.ignored('c:/project/dist-sibling/app.js')).toBe(false)
      expect(watcher.watcherOptions.ignored('D:/Project/dist/app.js')).toBe(false)
    }
    finally {
      watcher.close()
    }
  })

  it.each([
    '',
    '**/.cache',
    ['**/node_modules/**', '**/*.tmp', '**/{generated,cache}/**'],
    /(?:^|\/)cache(?:\/|$)/,
    (file: string) => file.includes('custom-cache'),
  ])('preserves existing Watchpack ignored rules %s', (ignored) => {
    const compiler = { outputPath: '/project/dist', options: { watchOptions: { ignored } }, hooks: {} }
    const original = new Watchpack({ ignored })
    setupWebpackWatchOutputIgnore(compiler as unknown as Compiler)
    const updated = new Watchpack(compiler.options.watchOptions)
    try {
      for (const [root, paths] of [['/project', path.posix], [String.raw`C:\project`, path.win32]] as const) {
        for (const file of ['src/index.ts', '.cache/nested/.entry.js', 'node_modules/pkg/index.js', 'generated/a.js', 'cache/a.js', 'a.tmp/nested.js', 'custom-cache/a.js']) {
          const candidate = paths.join(root, file)
          expect(updated.watcherOptions.ignored(candidate), candidate).toBe(original.watcherOptions.ignored(candidate))
        }
      }
    }
    finally {
      original.close()
      updated.close()
    }
  })
})
