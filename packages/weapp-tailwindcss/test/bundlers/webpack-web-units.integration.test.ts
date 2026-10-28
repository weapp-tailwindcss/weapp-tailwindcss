import type { UserDefinedOptions } from '@/types'
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import webpack from 'webpack'

const require = createRequire(import.meta.url)
const MiniCssExtractPlugin = require('mini-css-extract-plugin')
const { WeappTailwindcss } = require('weapp-tailwindcss/webpack')

describe('Webpack 真实 Web 生成的单位规则', () => {
  it.each([
    { name: 'rpx 任意值', options: { unitConversion: { rules: [{ from: 'rpx', to: 'rem', factor: 1 / 32 }] } }, candidate: 'p-[8rpx]', expected: '0.25rem' },
    { name: '同单位缩放', options: { unitConversion: { rules: [{ from: 'rem', to: 'rem', factor: 2 }] } }, candidate: 'p-[2rem]', expected: '4rem' },
    { name: '回到原单位的组合', options: { unitsToPx: { unitMap: { rem: 10 } }, unitConversion: { rules: [{ from: 'px', to: 'rem', factor: 0.5 }] } }, candidate: 'p-[2rem]', expected: '10rem' },
  ])('$name 由插件生成后直接进入真实 CSS 资产', async ({ options, candidate, expected }) => {
    const root = await realpath(await mkdtemp(path.join(tmpdir(), 'weapp-tw-webpack-web-units-')))
    let compiler: webpack.Compiler | undefined
    try {
      await mkdir(path.join(root, 'node_modules'))
      await symlink(path.dirname(require.resolve('tailwindcss/package.json')), path.join(root, 'node_modules', 'tailwindcss'), process.platform === 'win32' ? 'junction' : 'dir')
      await writeFile(path.join(root, 'entry.js'), 'import "./theme.css"')
      const cssEntry = path.join(root, 'theme.css')
      await writeFile(cssEntry, `@import "tailwindcss" source(none); @source inline("${candidate}");`)
      compiler = webpack({
        mode: 'development',
        context: root,
        entry: './entry.js',
        output: { path: path.join(root, 'dist'), filename: 'entry.js' },
        module: { rules: [{ test: /\.css$/, use: [MiniCssExtractPlugin.loader, require.resolve('css-loader')] }] },
        plugins: [
          new MiniCssExtractPlugin({ filename: 'theme.css' }),
          new WeappTailwindcss({
            generator: { target: 'web', webCompat: true },
            rem2rpx: false,
            cssOptions: { ...options, rem2rpx: false } as UserDefinedOptions['cssOptions'],
            tailwindcssBasedir: root,
            cssEntries: [cssEntry],
            cssMatcher: file => file.endsWith('.css'),
          }),
        ],
      })
      const stats = await new Promise<webpack.Stats>((resolve, reject) => compiler!.run((error, result) => {
        if (error || !result || result.hasErrors()) {
          reject(error ?? new Error(result?.toString({ all: false, errors: true }) ?? '缺少 Webpack 结果'))
        }
        else {
          resolve(result)
        }
      }))
      const css = stats.compilation.getAsset('theme.css')!.source.source().toString()
      expect(css).toContain(`padding: ${expected}`)
      expect(css).not.toContain('weapp-tailwindcss webpack-generated-css')
      expect(css).not.toMatch(/padding:\s*[\d.]+rpx\b/)
    }
    finally {
      if (compiler) {
        await new Promise<void>((resolve, reject) => compiler!.close(error => error ? reject(error) : resolve()))
      }
      await rm(root, { recursive: true, force: true })
    }
  })
})
