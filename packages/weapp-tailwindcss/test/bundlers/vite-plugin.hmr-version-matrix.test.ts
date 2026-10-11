import type { Plugin } from 'vite'
import { createRequire } from 'node:module'
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { WeappTailwindcss } from '@/bundlers/vite'

interface ViteBuildWatcher {
  close: () => Promise<void> | void
  on: (event: 'event', listener: (event: { code: string, error?: unknown }) => void) => void
  off?: (event: 'event', listener: (event: { code: string, error?: unknown }) => void) => void
}

interface ViteBuildModule {
  build: (config: Record<string, unknown>) => Promise<ViteBuildWatcher>
}

const require = createRequire(import.meta.url)
const tailwindcss4Basedir = path.dirname(require.resolve('tailwindcss/package.json'))
const createdDirs: string[] = []

const viteCases = [
  { major: 4, specifier: 'vite4' },
  { major: 5, specifier: 'vite5' },
  { major: 6, specifier: 'vite6' },
  { major: 7, specifier: 'vite7' },
  { major: 8, specifier: 'vite8' },
] as const

function wait(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function createFixtureRoot() {
  const tmpRoot = path.join(process.cwd(), 'test/.tmp-vite-hmr-matrix')
  await mkdir(tmpRoot, { recursive: true })
  const root = await mkdtemp(path.join(tmpRoot, 'case-'))
  createdDirs.push(root)
  const srcDir = path.join(root, 'src')
  await mkdir(srcDir, { recursive: true })

  const cssFile = path.join(srcDir, 'app.css')
  await Promise.all([
    writeFile(
      path.join(srcDir, 'main.ts'),
      'import "./app.css"\nexport const stamp = 1\n',
    ),
    writeFile(cssFile, createTailwindCss('mt-[10rpx]')),
  ])

  return {
    cssFile,
    root,
  }
}

function createTailwindCss(candidate: string) {
  return [
    '@import "tailwindcss";',
    `@source inline("${candidate}");`,
    '',
  ].join('\n')
}

function dropCssAssetOnHotRebuildPlugin(shouldDropCssAsset: () => boolean): Plugin {
  return {
    name: 'drop-css-asset-on-hot-rebuild',
    enforce: 'post',
    generateBundle(_options, bundle) {
      if (!shouldDropCssAsset()) {
        return
      }
      for (const file of Object.keys(bundle)) {
        if (file.endsWith('.css')) {
          delete bundle[file]
        }
      }
    },
  }
}

async function waitForWatchEnd(watcher: ViteBuildWatcher) {
  await new Promise<void>((resolve, reject) => {
    const onEvent = (event: { code: string, error?: unknown }) => {
      if (event.code === 'ERROR') {
        cleanup()
        reject(event.error instanceof Error ? event.error : new Error(String(event.error)))
        return
      }
      if (event.code === 'END') {
        cleanup()
        resolve()
      }
    }
    const cleanup = () => watcher.off?.('event', onEvent)
    watcher.on('event', onEvent)
  })
}

async function closeWatcher(watcher: ViteBuildWatcher | undefined) {
  if (!watcher) {
    return
  }
  await watcher.close()
}

async function readBuiltStyle(distDir: string) {
  const pending = [distDir]
  while (pending.length > 0) {
    const current = pending.pop()!
    const entries = await readdir(current, { withFileTypes: true })
    for (const entry of entries) {
      const file = path.join(current, entry.name)
      if (entry.isDirectory()) {
        pending.push(file)
        continue
      }
      if (entry.isFile() && (entry.name.endsWith('.css') || entry.name.endsWith('.wxss'))) {
        return readFile(file, 'utf8')
      }
    }
  }
  throw new Error(`未找到 Vite watch 生成的样式文件: ${distDir}`)
}

async function waitForBuiltStyle(distDir: string) {
  let lastError: unknown
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      return await readBuiltStyle(distDir)
    }
    catch (error) {
      lastError = error
      await wait(50)
    }
  }
  throw lastError
}

async function runWatchHmrReplayCase(viteSpecifier: string) {
  const vite = await import(viteSpecifier) as ViteBuildModule
  const { cssFile, root } = await createFixtureRoot()
  const distDir = path.join(root, 'dist')
  let shouldDropCssAsset = false
  const watcher = await vite.build({
    root,
    logLevel: 'silent',
    clearScreen: false,
    publicDir: false,
    css: {
      postcss: {
        plugins: [],
      },
    },
    plugins: [
      dropCssAssetOnHotRebuildPlugin(() => shouldDropCssAsset),
      ...WeappTailwindcss({
        appType: 'weapp-vite',
        cssEntries: [cssFile],
        tailwindcssBasedir: tailwindcss4Basedir,
        tailwindcss: {
            packageName: 'tailwindcss',
          v4: {
            cssEntries: [cssFile],
          },
        },
      }) ?? [],
    ],
    build: {
      minify: false,
      watch: {},
      rollupOptions: {
        input: path.join(root, 'src/main.ts'),
        output: {
          assetFileNames: '[name].[ext]',
          entryFileNames: '[name].js',
          chunkFileNames: '[name].js',
        },
      },
    },
  })

  try {
    await waitForWatchEnd(watcher)
    const firstCss = await waitForBuiltStyle(distDir)
    expect(firstCss).toContain('.mt-_b10rpx_B')

    const rebuild = waitForWatchEnd(watcher)
    shouldDropCssAsset = true
    await writeFile(cssFile, createTailwindCss('pt-[12rpx]'))
    await rebuild

    const secondCss = await waitForBuiltStyle(distDir)
    expect(secondCss).toContain('.pt-_b12rpx_B')
    expect(secondCss).not.toContain('.pt-\\[12rpx\\]')
  }
  finally {
    await closeWatcher(watcher)
  }
}

describe('bundlers/vite hmr version matrix', () => {
  afterEach(async () => {
    await Promise.all(
      createdDirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })),
    )
  })

  it.each(viteCases)(
    'replays generated css through emitFile during Vite $major watch HMR rebuild',
    async ({ specifier }) => {
      await runWatchHmrReplayCase(specifier)
    },
    120_000,
  )
})
