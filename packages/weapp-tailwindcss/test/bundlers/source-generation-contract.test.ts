import type { Transform } from 'node:stream'
import type { Compiler, Configuration, WebpackPluginInstance } from 'webpack'
import type { SourceGenerationContractAdapter } from '../../../test-helper/src/source-generation-contract'
import { Buffer } from 'node:buffer'
import { readdir, readFile, realpath, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import Vinyl from 'vinyl'
import { expect } from 'vitest'
import webpack from 'webpack'
import { sourceGenerationContract } from '../../../test-helper/src/source-generation-contract'

const repositoryRoot = path.resolve(import.meta.dirname, '../../../..')
const require = createRequire(import.meta.url)
const rsbuildRequire = createRequire(path.join(repositoryRoot, 'demo/web/react-rsbuild-tailwindcss-v4/package.json'))
const rspackRequire = createRequire(rsbuildRequire.resolve('@rsbuild/core'))
const { rspack, CssExtractRspackPlugin } = rspackRequire('@rspack/core') as {
  rspack: typeof webpack
  CssExtractRspackPlugin: { new (options: { filename: string }): WebpackPluginInstance, loader: string }
}

type ContractCompiler = Omit<Compiler, 'run'> & {
  run: (callback: Parameters<Compiler['run']>[0], changes?: { modifiedFiles: Set<string>, removedFiles: Set<string> }) => void
}

function compilerAdapter(kind: 'webpack' | 'rspack'): SourceGenerationContractAdapter {
  const compilers = new Map<string, ContractCompiler>()
  const snapshots = new Map<string, Map<string, string>>()
  async function readSources(root: string): Promise<Array<[string, string]>> {
    const entries = await readdir(root, { withFileTypes: true })
    const files = await Promise.all(entries.filter(entry => !['node_modules', 'dist'].includes(entry.name)).map(async (entry) => {
      const file = path.join(root, entry.name)
      return entry.isDirectory() ? readSources(file) : entry.isFile() ? [[file, await readFile(file, 'utf8')] as [string, string]] : []
    }))
    return [[root, entries.filter(entry => !['node_modules', 'dist'].includes(entry.name)).map(entry => entry.name).sort().join('\n')], ...files.flat()]
  }
  return {
    async generate(root, css) {
      root = await realpath(root)
      await writeFile(path.join(root, 'contract.css'), css)
      await writeFile(path.join(root, 'contract.js'), 'import "./contract.css"')
      let compiler = compilers.get(root)
      if (!compiler) {
        const { WeappTailwindcss } = require(`weapp-tailwindcss/${kind}`)
        const configuration: Configuration = {
          mode: 'development',
          context: root,
          entry: './contract.js',
          cache: false,
          devtool: false,
          output: { path: path.join(root, 'dist'), filename: 'contract.js' },
          module: { rules: [kind === 'rspack'
            ? { test: /\.css$/, use: [CssExtractRspackPlugin.loader, require.resolve('css-loader')] }
            : { test: /\.css$/, type: 'asset/resource', generator: { filename: 'contract.css' } }] },
          plugins: [new WeappTailwindcss({
            tailwindcssBasedir: root,
            cssEntries: [path.join(root, 'contract.css')],
            generator: { target: 'web' },
          }), ...(kind === 'rspack' ? [new CssExtractRspackPlugin({ filename: 'contract.css' })] : [])],
        }
        if (kind === 'rspack') {
          require('weapp-tailwindcss/rspack').patchRspackConfig(configuration)
        }
        compiler = (kind === 'webpack' ? webpack : rspack)(configuration)!
        compilers.set(root, compiler)
      }
      const snapshot = new Map(await readSources(root))
      const previous = snapshots.get(root) ?? new Map<string, string>()
      compiler.modifiedFiles = new Set([...snapshot].filter(([file, content]) => previous.get(file) !== content).map(([file]) => file))
      compiler.removedFiles = new Set([...previous.keys()].filter(file => !snapshot.has(file)))
      compiler.inputFileSystem?.purge?.()
      snapshots.set(root, snapshot)
      await new Promise<void>((resolve, reject) => compiler!.run((error, stats) => {
        if (error) {
          reject(error)
        }
        else if (stats?.hasErrors()) {
          reject(new Error(stats.toString({ all: false, errors: true })))
        }
        else { resolve() }
      }, { modifiedFiles: compiler!.modifiedFiles!, removedFiles: compiler!.removedFiles! }))
      return { css: await readFile(path.join(root, 'dist', 'contract.css'), 'utf8') }
    },
    async dispose() {
      await Promise.all([...compilers.values()].map(compiler => new Promise<void>((resolve, reject) => {
        compiler.close(error => error ? reject(error) : resolve())
      })))
      compilers.clear()
      snapshots.clear()
    },
  }
}

function gulpAdapter(): SourceGenerationContractAdapter {
  const { createPlugins } = require('weapp-tailwindcss/gulp') as typeof import('@/bundlers/gulp')
  const pluginsByRoot = new Map<string, ReturnType<typeof createPlugins>>()
  return {
    async generate(root, css) {
      const entry = path.join(root, 'contract.css')
      await writeFile(entry, css)
      let plugins = pluginsByRoot.get(root)
      if (!plugins) {
        plugins = createPlugins({ tailwindcssBasedir: root, cssEntries: [entry], generator: { target: 'web' } })
        pluginsByRoot.set(root, plugins)
      }
      await plugins.watchChange(entry)
      const file = new Vinyl({ cwd: root, base: root, path: entry, contents: Buffer.from(css) })
      const stream: Transform = plugins.transformWxss()
      const output = await new Promise<Vinyl>((resolve, reject) => {
        stream.once('data', resolve)
        stream.once('error', reject)
        stream.end(file)
      })
      return { css: output.contents!.toString() }
    },
    async dispose() {
      await Promise.all([...pluginsByRoot.values()].map(plugins => plugins.dispose()))
      pluginsByRoot.clear()
    },
  }
}

sourceGenerationContract('Webpack 真实编译入口', compilerAdapter('webpack'), expect, repositoryRoot)
sourceGenerationContract('Rspack 真实编译入口', compilerAdapter('rspack'), expect, repositoryRoot)
sourceGenerationContract('Gulp Vinyl 入口', gulpAdapter(), expect, repositoryRoot)
