import { mkdir, mkdtemp, realpath, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { expect, it, vi } from 'vitest'
import webpack from 'webpack'
import { registerWebpackSourceContexts, registerWebpackWatchFile } from '../../src/bundlers/webpack/loaders/watch-dependencies'

const require = createRequire(import.meta.url)
const taroRequire = createRequire(require.resolve('@tarojs/webpack5-runner/package.json', { paths: [path.resolve('demo/subpackage-taro-webpack-react-tailwindcss-v4')] }))
const VirtualModulesPlugin = taroRequire('webpack-virtual-modules')

it('来源目录监听使用 glob 的静态前缀，并保留新增目录依赖', async () => {
  const temporary = await mkdtemp(path.join(tmpdir(), 'webpack-source-context-'))
  const root = await realpath(temporary)
  const context = { addDependency: vi.fn(), addMissingDependency: vi.fn(), addContextDependency: vi.fn() }
  try {
    await mkdir(path.join(root, 'templates'))
    await registerWebpackSourceContexts(context, {
      root,
      explicit: true,
      entries: [
        { base: root, pattern: './{templates,new-templates}/**/*.{qxml,tsx}', negated: false },
        { base: root, pattern: path.join(root, 'templates', '**', '*.wxml'), negated: false },
        { base: root, pattern: './ignored/**', negated: true },
      ],
    })
    expect(context.addContextDependency.mock.calls).toEqual([[path.join(root, 'templates')]])
    expect(context.addMissingDependency.mock.calls).toEqual([[path.join(root, 'new-templates')]])
    expect(context.addDependency).not.toHaveBeenCalled()
    context.addContextDependency.mockClear()
    await registerWebpackSourceContexts(context, { root, entries: [], explicit: true })
    expect(context.addContextDependency).not.toHaveBeenCalled()
    await registerWebpackSourceContexts(context, { root, entries: [], explicit: false })
    expect(context.addContextDependency).toHaveBeenCalledWith(root)
  }
  finally {
    await rm(temporary, { recursive: true, force: true })
  }
})

it('registers a real Webpack virtual module as an existing input dependency', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'webpack-virtual-input-'))
  const file = path.join(root, 'virtual-entry.js')
  const modules = new VirtualModulesPlugin()
  const compiler = webpack({ mode: 'development', context: root, entry: file, output: { path: path.join(root, 'dist') }, plugins: [modules] })
  const context = { fs: compiler.inputFileSystem!, addDependency: vi.fn(), addMissingDependency: vi.fn(), addContextDependency: vi.fn() }
  try {
    modules.writeModule(file, 'export default 42')
    await registerWebpackWatchFile(context, file)
    expect(context.addDependency).toHaveBeenCalledWith(file)
    expect(context.addMissingDependency).not.toHaveBeenCalled()
    await registerWebpackWatchFile(context, path.join(root, 'absent.js'))
    expect(context.addMissingDependency).toHaveBeenCalledWith(path.join(root, 'absent.js'))
    await registerWebpackWatchFile(context, root)
    expect(context.addContextDependency).toHaveBeenCalledWith(root)
  }
  finally {
    await new Promise<void>((resolve, reject) => compiler.close(error => error ? reject(error) : resolve()))
    await rm(root, { recursive: true, force: true })
  }
})
