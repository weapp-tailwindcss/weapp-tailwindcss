import type { Plugin } from 'vite'
import type { ViteBuildWatcher } from '../helpers/vite-watch-session'
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { WeappTailwindcss } from '@/bundlers/vite'
import { generateRawArtifact } from '@/tailwindcss/v4-engine/generator/raw-generation'
import { createViteWatchSession, joinViteWatchCleanup } from '../helpers/vite-watch-session'

interface ViteBuildModule {
  build: (config: Record<string, unknown>) => Promise<ViteBuildWatcher>
}

vi.mock('@/tailwindcss/v4-engine/generator/raw-generation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/tailwindcss/v4-engine/generator/raw-generation')>()
  return {
    ...actual,
    generateRawArtifact: vi.fn(actual.generateRawArtifact),
  }
})

const foreignCandidate = `z-[${process.pid}]`
const require = createRequire(import.meta.url)
const tailwindcss4Basedir = path.dirname(require.resolve('tailwindcss/package.json'))
const createdDirs: string[] = []
const pendingCases: Promise<void>[] = []
const closeWatchers: Array<() => Promise<void>> = []

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
  const foreignRoot = await mkdtemp(path.join(process.cwd(), 'test', 'vite-hmr-foreign-'))
  createdDirs.push(foreignRoot)
  await writeFile(path.join(foreignRoot, 'foreign.html'), `<view class="${foreignCandidate}"></view>`)
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

async function waitForBuiltStyle(distDir: string, signal: AbortSignal) {
  let lastError: unknown
  for (let attempt = 0; attempt < 40; attempt++) {
    signal.throwIfAborted()
    try {
      const css = await readBuiltStyle(distDir)
      signal.throwIfAborted()
      return css
    }
    catch (error) {
      signal.throwIfAborted()
      lastError = error
      await wait(50)
    }
  }
  throw lastError
}

async function runWatchHmrReplayCase(viteSpecifier: string, signal: AbortSignal) {
  const session = createViteWatchSession(signal)
  closeWatchers.push(session.close)
  signal.throwIfAborted()
  const vite = await import(viteSpecifier) as ViteBuildModule
  signal.throwIfAborted()
  const { cssFile, root } = await createFixtureRoot()
  const distDir = path.join(root, 'dist')
  let shouldDropCssAsset = false
  await session.start(() => vite.build({
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
        tailwindcssRuntimeOptions: {
          // Tailwind 包复用仓库安装，源码身份限定为本轮临时项目。
          projectRoot: root,
        },
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
  }))

  try {
    await session.waitForEnd()
    const firstCss = await waitForBuiltStyle(distDir, signal)
    expect(firstCss).toContain('.mt-_b10rpx_B')

    const rebuild = session.waitForEnd()
    shouldDropCssAsset = true
    await writeFile(cssFile, createTailwindCss('pt-[12rpx]'))
    await rebuild

    const secondCss = await waitForBuiltStyle(distDir, signal)
    expect(secondCss).toContain('.pt-_b12rpx_B')
    expect(secondCss).not.toContain('.pt-\\[12rpx\\]')

    const repeatedRebuild = session.waitForEnd()
    await writeFile(path.join(root, 'src/main.ts'), 'import "./app.css"\nexport const stamp = 2\n')
    await repeatedRebuild
    const replayedCss = await waitForBuiltStyle(distDir, signal)
    expect(replayedCss).toContain('.pt-_b12rpx_B')
    expect(replayedCss).not.toContain('.pt-\\[12rpx\\]')

    // 真实生成仍执行；相邻 fixture 的候选不能进入当前运行时。
    const generation = vi.mocked(generateRawArtifact)
    expect(generation).toHaveBeenCalled()
    const artifacts = await Promise.all(generation.mock.results.map(result => result.value))
    expect(artifacts.some(artifact => artifact.classSet.has('mt-[10rpx]'))).toBe(true)
    expect(artifacts.some(artifact => artifact.classSet.has(foreignCandidate))).toBe(false)
  }
  finally {
    await session.close()
  }
}

describe('bundlers/vite hmr version matrix', () => {
  afterEach(async () => {
    try {
      await joinViteWatchCleanup(pendingCases.splice(0), closeWatchers.splice(0), async () => {
        // 超时后的在途生成与 watcher 均已结束，才清理 mock 和输入目录。
        vi.mocked(generateRawArtifact).mockClear()
        await Promise.all(createdDirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })))
      })
    }
    catch (error) {
      const retained = createdDirs.splice(0)
      throw new Error(`Vite HMR 夹具收尾失败；保留目录：${JSON.stringify(retained)}`, { cause: error })
    }
  })

  it.for(viteCases)(
    'replays generated css through emitFile during Vite $major watch HMR rebuild',
    async ({ specifier }, { signal }) => {
      const pending = runWatchHmrReplayCase(specifier, signal)
      pendingCases.push(pending)
      await pending
    },
    120_000,
  )
})
