import type { OutputBundle, RollupWatcher } from 'rollup'
import type { InlineConfig, Plugin } from 'vite'
import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { vi } from 'vitest'
import { StyleInjector } from 'weapp-style-injector/vite/uni-app'
import { WeappTailwindcss } from '@/bundlers/vite'

export async function createInjectorWatchProject() {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'vite-injector-watch-parity-')))
  try {
    await symlink(path.resolve(__dirname, '../../../../../node_modules'), path.join(root, 'node_modules'), 'junction')
    await mkdir(path.join(root, 'feature', 'components'), { recursive: true })
    await writeFile(path.join(root, 'pages.json'), JSON.stringify({ subPackages: [{ root: 'feature', pages: ['page'] }] }))
    await writeFile(path.join(root, 'entry.js'), 'import "./entry.css"; import { classes } from "./feature/components/card.js"; console.log(classes)')
    await writeFile(path.join(root, 'entry.css'), '@import "tailwindcss" source(none); @source inline("w-[17px]");')
    await writeFile(path.join(root, 'feature', 'index.css'), '.first { color: red; }')
    await writeFile(path.join(root, 'feature', 'components', 'card.js'), 'export const classes = "w-[17px]"')
    await writeFile(path.join(root, 'feature', 'components', 'card.css'), '.card { width: 7rpx; }')
    return root
  }
  catch (error) {
    await rm(root, { recursive: true, force: true })
    throw error
  }
}

function emitComponentStyle(root: string): Plugin {
  return {
    name: 'fixture:uni-component-assets',
    async buildStart() {
      const sourceFile = path.join(root, 'feature', 'components', 'card.css')
      this.addWatchFile(sourceFile)
      const source = await readFile(sourceFile, 'utf8')
      this.emitFile({ type: 'asset', fileName: 'feature/components/card.acss', source, originalFileName: sourceFile })
      this.emitFile({ type: 'asset', fileName: 'feature/page.acss', source: '.page { display: flex; }' })
    },
  }
}

export function injectorWatchConfig(root: string, builtin: boolean, observer: Plugin): InlineConfig {
  const injectorOptions = {
    subPackages: { pagesJsonPath: path.join(root, 'pages.json'), preprocess: false },
  }
  const standalone = builtin ? [] : StyleInjector(injectorOptions)
  return {
    root,
    configFile: false,
    logLevel: 'silent',
    plugins: [
      emitComponentStyle(root),
      standalone,
      WeappTailwindcss({
        appType: 'uni-app-vite',
        platform: 'mp-alipay',
        tailwindcssBasedir: root,
        cssEntries: [path.join(root, 'entry.css')],
        styleInjector: builtin ? injectorOptions : false,
        generator: { target: 'weapp', hmr: { preserveDeletedCss: false } },
      }),
      observer,
    ],
    build: {
      watch: {},
      write: false,
      minify: false,
      cssMinify: false,
      rollupOptions: {
        input: path.join(root, 'entry.js'),
        output: { entryFileNames: 'entry.js', assetFileNames: '[name][extname]' },
      },
    },
  }
}

export function createInjectorWatchObserver(name: string) {
  let outputs: Record<string, string> = {}
  let completed = 0
  let failure: unknown
  const observe = (bundle: OutputBundle) => {
    outputs = Object.fromEntries(Object.entries(bundle)
      .filter(([file, output]) => output.type === 'chunk' || /\.(?:css|acss)$/.test(file))
      .map(([file, output]) => [file, output.type === 'chunk' ? output.code : String(output.source)])
      .sort(([left], [right]) => left!.localeCompare(right!)))
  }
  return {
    plugin: {
      name: 'fixture:observe-injector-output',
      enforce: 'post',
      generateBundle: { order: 'post', handler(_options, bundle) {
        observe(bundle)
      } },
    } satisfies Plugin,
    attach(watcher: RollupWatcher) {
      watcher.on('event', (event) => {
        if (event.code === 'END') {
          completed++
        }
        else if (event.code === 'ERROR') {
          failure = event.error
        }
      })
    },
    async waitFor(round: number, verify: (output: Record<string, string>) => void) {
      await vi.waitFor(() => {
        if (failure) {
          throw failure
        }
        if (completed < round) {
          throw new Error(`等待 injector 第 ${round} 轮构建，已完成 ${completed} 轮`)
        }
        try {
          verify(outputs)
        }
        catch (error) {
          throw new Error(`${name} injector 第 ${round} 轮产物不满足契约`, { cause: error })
        }
      }, { timeout: 20_000, interval: 30 })
      return outputs
    },
  }
}
