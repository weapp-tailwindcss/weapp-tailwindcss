import type { PluginObj, PluginPass } from '@babel/core'
import type { Configuration, Stats } from 'webpack'
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import { transformAsync } from '@babel/core'
import { build as esbuildBuild } from 'esbuild'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const testDir = fileURLToPath(new URL('.', import.meta.url))
const packageRoot = resolve(testDir, '..')
const workspaceRoot = resolve(packageRoot, '..', '..')
const TerserPlugin = require('terser-webpack-plugin') as typeof import('terser-webpack-plugin')
const webpack = require('webpack') as typeof import('webpack')

const ESBUILD_SOURCE = [
  'export function weappTwIgnore() {',
  '  return 42',
  '}',
  'console.log(weappTwIgnore())',
].join('\n')

const WEBPACK_SOURCE = [
  'export function weappTwIgnore() {',
  '  return weappTwIgnore.name',
  '}',
  'console.log(weappTwIgnore())',
].join('\n')

const SWC_SOURCE = [
  'function weappTwIgnore() {',
  '  return weappTwIgnore.name',
  '}',
  'console.log(weappTwIgnore())',
].join('\n')
const BABEL_SOURCE = WEBPACK_SOURCE

async function bundleWithEsbuild(keepNames: boolean) {
  const result = await esbuildBuild({
    bundle: true,
    minify: true,
    format: 'iife',
    write: false,
    keepNames,
    stdin: {
      contents: ESBUILD_SOURCE,
      sourcefile: 'entry.js',
      loader: 'js',
    },
  })
  return (result.outputFiles[0]?.text ?? '').trim()
}

type PrettierFormat = typeof import('prettier')['format']
interface PrettierModuleWithDefault {
  default?: {
    format?: PrettierFormat
  }
}

let prettierFormatPromise: Promise<PrettierFormat> | undefined

async function loadPrettierFormat() {
  if (!prettierFormatPromise) {
    prettierFormatPromise = import('prettier').then((module) => {
      if (typeof module.format === 'function') {
        return module.format
      }

      const maybeDefault = (module as PrettierModuleWithDefault).default
      if (
        typeof maybeDefault === 'object'
        && maybeDefault !== null
        && typeof maybeDefault.format === 'function'
      ) {
        return maybeDefault.format
      }

      throw new Error('Unable to load prettier.format')
    })
  }
  return prettierFormatPromise
}

async function formatCode(code: string) {
  const format = await loadPrettierFormat()
  const formatted = await format(code, {
    parser: 'babel',
    semi: true,
    singleQuote: false,
    printWidth: 80,
  })
  return formatted.trimEnd()
}

async function formatOutputs(outputs: { defaults: string, keep: string }) {
  return {
    defaults: await formatCode(outputs.defaults),
    keep: await formatCode(outputs.keep),
  }
}

function formatSnapshotText(formatted: { defaults: string, keep: string }) {
  return [
    'defaults:',
    formatted.defaults,
    '',
    'keep:',
    formatted.keep,
    '',
  ].join('\n')
}

async function runWebpack(config: Configuration) {
  const compiler = webpack(config)

  try {
    return await new Promise<Stats>((resolve, reject) => {
      compiler?.run((err, statsResult) => {
        if (err) {
          reject(err)
          return
        }
        if (!statsResult) {
          reject(new Error('Webpack did not return stats'))
          return
        }
        if (statsResult.hasErrors()) {
          const info = statsResult.toJson({ all: false, errors: true })
          const message = info.errors?.map(error => error?.message).join('\n')
          reject(new Error(message || 'Webpack reported compilation errors'))
          return
        }
        resolve(statsResult)
      })
    })
  }
  finally {
    await new Promise<void>((resolve, reject) => {
      compiler?.close((closeErr) => {
        if (closeErr) {
          reject(closeErr)
          return
        }
        resolve()
      })
    })
  }
}

async function bundleWithWebpack(keepFnNames: boolean) {
  const workDir = await mkdtemp(join(tmpdir(), 'weapp-minify-'))
  const entry = join(workDir, 'entry.mjs')
  await writeFile(entry, WEBPACK_SOURCE, 'utf8')

  const terserPlugin = new TerserPlugin({
    terserOptions: keepFnNames
      ? {
          compress: {
            keep_fnames: true,
          },
          mangle: {
            keep_fnames: true,
            keep_classnames: true,
          },
        }
      : {},
  })

  const config: Configuration = {
    mode: 'production',
    entry,
    output: {
      filename: 'bundle.js',
      path: workDir,
    },
    optimization: {
      minimize: true,
      minimizer: [terserPlugin],
    },
    target: ['web', 'es5'],
  }

  try {
    await runWebpack(config)
    return await readFile(join(workDir, 'bundle.js'), 'utf8')
  }
  finally {
    await rm(workDir, { recursive: true, force: true })
  }
}

type SwcModule = typeof import('@swc/core')

let swcModulePromise: Promise<SwcModule> | undefined

async function loadSwcCore() {
  if (!swcModulePromise) {
    swcModulePromise = (async () => {
      try {
        return require('@swc/core') as SwcModule
      }
      catch (error) {
        const pnpmDir = join(workspaceRoot, 'node_modules', '.pnpm')
        const entries = await readdir(pnpmDir)
        const candidate = entries.find(name => name.startsWith('@swc+core@'))
        if (!candidate) {
          throw error
        }
        return require(join(pnpmDir, candidate, 'node_modules', '@swc', 'core')) as SwcModule
      }
    })()
  }
  return swcModulePromise
}

async function bundleWithSwc(keepFnNames: boolean) {
  const swc = await loadSwcCore()
  const result = await swc.minify(SWC_SOURCE, {
    compress: true,
    mangle: keepFnNames
      ? {
          keep_fnames: true,
          keep_classnames: true,
          toplevel: true,
        }
      : {
          toplevel: true,
        },
    module: false,
    sourceMap: false,
  })
  return result.code.trim()
}

interface ManglePluginOptions {
  keepNames?: boolean
}

interface BabelManglePluginState extends PluginPass {
  opts: PluginPass['opts'] & ManglePluginOptions
}

function babelManglePlugin(): PluginObj<BabelManglePluginState> {
  return {
    name: 'weapp-helper-mangle',
    visitor: {
      FunctionDeclaration(path, state) {
        const functionName = path.node.id?.name
        if (functionName !== 'weappTwIgnore') {
          return
        }
        const { keepNames } = state.opts as ManglePluginOptions
        if (keepNames) {
          return
        }
        path.scope.rename(functionName, 'o')
      },
    },
  }
}

async function bundleWithBabel(keepFnNames: boolean) {
  const result = await transformAsync(BABEL_SOURCE, {
    configFile: false,
    babelrc: false,
    sourceType: 'module',
    minified: true,
    comments: false,
    compact: true,
    plugins: [[babelManglePlugin, { keepNames: keepFnNames }]],
    generatorOpts: {
      minified: true,
      comments: false,
      compact: true,
    },
  })

  return (result?.code ?? '').trim()
}

describe('esbuild keepNames', () => {
  it('produces different minified outputs depending on keepNames', async () => {
    const outputs = {
      defaults: await bundleWithEsbuild(false),
      keep: await bundleWithEsbuild(true),
    }

    expect(outputs.defaults).not.toEqual(outputs.keep)
    const formatted = await formatOutputs(outputs)

    expect(formatSnapshotText(formatted)).toMatchSnapshot()
  })
})

describe('terser-webpack keep_fnames', () => {
  it('shows the effect of keep_fnames on bundled output', async () => {
    const outputs = {
      defaults: await bundleWithWebpack(false),
      keep: await bundleWithWebpack(true),
    }

    const execute = (code: string) => {
      const logs: unknown[][] = []
      runInNewContext(code, { console: { log: (...values: unknown[]) => logs.push(values) } })
      return logs
    }
    const defaultLogs = execute(outputs.defaults)
    expect(defaultLogs).toEqual([[expect.any(String)]])
    expect(defaultLogs).not.toEqual([['weappTwIgnore']])
    expect(execute(outputs.keep)).toEqual([['weappTwIgnore']])
    expect(outputs.defaults).not.toEqual(outputs.keep)
    const formatted = await formatOutputs(outputs)

    expect(formatSnapshotText(formatted)).toMatchSnapshot()
  })
})

describe('swc keep_fnames', () => {
  it('shows the effect of keep_fnames on bundled output', async () => {
    const outputs = {
      defaults: await bundleWithSwc(false),
      keep: await bundleWithSwc(true),
    }

    expect(outputs.defaults).not.toEqual(outputs.keep)
    const formatted = await formatOutputs(outputs)

    expect(formatSnapshotText(formatted)).toMatchSnapshot()
  })
})

describe('babel keepNames', () => {
  it('shows the effect of the custom mangler on bundled output', async () => {
    const outputs = {
      defaults: await bundleWithBabel(false),
      keep: await bundleWithBabel(true),
    }

    expect(outputs.defaults).not.toEqual(outputs.keep)
    const formatted = await formatOutputs(outputs)

    expect(formatSnapshotText(formatted)).toMatchSnapshot()
  })
})
