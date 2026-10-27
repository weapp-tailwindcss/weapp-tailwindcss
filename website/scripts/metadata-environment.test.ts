import type { ConfigureWebpackUtils, LoadContext } from '@docusaurus/types'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import vm from 'node:vm'
import { expect, it } from 'vitest'
import metadataEnvironment from '../config/metadataEnvironment'

const require = createRequire(import.meta.resolve('@docusaurus/core/package.json'))
const webpack: ConfigureWebpackUtils['currentBundler']['instance'] = require('webpack')

it.each(['https://tw.weapp.dev', 'https://next.tw.weapp.dev'])('浏览器没有 process 时仍使用构建来源 %s', async (origin) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'website-metadata-'))
  const entry = path.join(directory, 'entry.js')
  const compiler = webpack({
    mode: 'production',
    target: 'web',
    entry,
    output: { path: directory, filename: 'bundle.cjs', library: { type: 'commonjs2' } },
    plugins: metadataEnvironment({ siteConfig: { url: origin } } as LoadContext).configureWebpack({}, false, { currentBundler: { name: 'webpack', instance: webpack }, getStyleLoaders: () => [], getJSLoader: () => ({}) }).plugins,
  })
  try {
    await writeFile(entry, 'module.exports = globalThis.process.env.SITE_URL')
    await new Promise<void>((resolve, reject) => compiler.run((error, stats) => {
      if (error || stats?.hasErrors()) {
        reject(error ?? new Error(stats?.toString({ all: false, errors: true })))
      }
      else {
        resolve()
      }
    }))
    const sandbox = { module: { exports: undefined } }
    vm.runInNewContext(await readFile(path.join(directory, 'bundle.cjs'), 'utf8'), sandbox)
    expect(sandbox.module.exports).toBe(origin)
  }
  finally {
    await new Promise<void>((resolve, reject) => compiler.close(error => error ? reject(error) : resolve()))
    await rm(directory, { recursive: true, force: true })
  }
})
