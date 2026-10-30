import type { UserDefinedOptions } from '@/types'
import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { postcss } from '@weapp-tailwindcss/postcss'
import { describe, expect, it, vi } from 'vitest'
import webpack from 'webpack'

const require = createRequire(import.meta.url)
const MiniCssExtractPlugin = require('mini-css-extract-plugin')
const { WeappTailwindcss } = require('weapp-tailwindcss/webpack')

const frameworkRequire = createRequire(new URL('../../../../demo/gulp-tailwindcss-v4/package.json', import.meta.url))
const pxtransform = frameworkRequire('postcss-pxtransform')

const frameworkCases = [false, true].flatMap(webCompat => ['inline', 'implicit'].flatMap(config => ['none', 'unrelated', 'h5'].map(pipeline => ({
  name: `框架 ${pipeline}/${config}（webCompat=${webCompat}）`,
  options: { px2rpx: true },
  candidate: 'p-[16px] text-[32rpx]',
  expected: pipeline === 'h5' ? '0.4rem' : '0.5rem',
  pipeline,
  webCompat,
  config,
}))))

describe('Webpack 真实 Web 生成的单位规则', () => {
  it.each([
    { name: 'rpx 任意值', options: { unitConversion: { rules: [{ from: 'rpx', to: 'rem', factor: 1 / 32 }] } }, candidate: 'p-[8rpx]', expected: '0.25rem', pipeline: 'none', webCompat: true },
    { name: '同单位缩放', options: { unitConversion: { rules: [{ from: 'rem', to: 'rem', factor: 2 }] } }, candidate: 'p-[2rem]', expected: '4rem', pipeline: 'h5', webCompat: true },
    { name: '回到原单位的组合', options: { unitsToPx: { unitMap: { rem: 10 } }, unitConversion: { rules: [{ from: 'px', to: 'rem', factor: 0.5 }] } }, candidate: 'p-[2rem]', expected: '10rem', pipeline: 'h5', webCompat: true },
    ...frameworkCases,
  ])('$name 由插件生成后直接进入真实 CSS 资产', async ({ options, candidate, expected, pipeline, webCompat, ...scenario }) => {
    vi.stubEnv('TARO_ENV', 'h5')
    const root = await realpath(await mkdtemp(path.join(tmpdir(), 'weapp-tw-webpack-web-units-')))
    let compiler: webpack.Compiler | undefined
    try {
      await mkdir(path.join(root, 'node_modules'))
      await symlink(path.dirname(require.resolve('tailwindcss/package.json')), path.join(root, 'node_modules', 'tailwindcss'), process.platform === 'win32' ? 'junction' : 'dir')
      await writeFile(path.join(root, 'entry.js'), 'import "./theme.css"')
      const cssEntry = path.join(root, 'theme.css')
      await writeFile(cssEntry, `@import "tailwindcss" source(none); @source inline("${candidate}");`)
      const implicit = 'config' in scenario && scenario.config === 'implicit'
      if (implicit && pipeline !== 'none') {
        const plugin = pipeline === 'h5'
          ? `require(${JSON.stringify(frameworkRequire.resolve('postcss-pxtransform'))})({platform:'h5',designWidth:750,deviceRatio:{750:1}})`
          : '{postcssPlugin:"unrelated-framework",Once(){}}'
        await writeFile(path.join(root, 'postcss.config.cjs'), `module.exports={plugins:[${plugin}]}`)
      }
      compiler = webpack({
        mode: 'development',
        context: root,
        entry: './entry.js',
        output: { path: path.join(root, 'dist'), filename: 'entry.js' },
        module: {
          rules: [{
            test: /\.css$/,
            use: [MiniCssExtractPlugin.loader, require.resolve('css-loader'), ...(pipeline === 'none'
              ? []
              : [{
                  loader: require.resolve('postcss-loader'),
                  options: implicit
                    ? {}
                    : {
                        postcssOptions: {
                          plugins: [pipeline === 'h5'
                            ? pxtransform({ platform: 'h5', designWidth: 750, deviceRatio: { 750: 1 } })
                            : { postcssPlugin: 'unrelated-framework', Once() {} }],
                        },
                      },
                }])],
          }],
        },
        plugins: [
          new MiniCssExtractPlugin({ filename: 'theme.css' }),
          new WeappTailwindcss({
            generator: { target: 'web', webCompat },
            rem2rpx: false,
            cssOptions: { ...options, rem2rpx: false } as UserDefinedOptions['cssOptions'],
            tailwindcssBasedir: root,
            cssEntries: [cssEntry],
            cssMatcher: file => file.endsWith('.css'),
          }),
        ],
      })
      await new Promise<webpack.Stats>((resolve, reject) => compiler!.run((error, result) => {
        if (error || !result || result.hasErrors()) {
          reject(error ?? new Error(result?.toString({ all: false, errors: true }) ?? '缺少 Webpack 结果'))
        }
        else {
          resolve(result)
        }
      }))
      const css = await readFile(path.join(root, 'dist', 'theme.css'), 'utf8')
      expect(css).toContain(`padding: ${expected}`)
      const paddings: string[] = []
      postcss.parse(css).walkRules((rule) => {
        if (rule.selector.startsWith('.p-')) {
          rule.walkDecls('padding', (declaration) => {
            paddings.push(declaration.value)
          })
        }
        if (candidate.includes('text-') && rule.selector.startsWith('.text-')) {
          const declarations = rule.nodes.filter(node => node.type === 'decl')
          expect(declarations.map(declaration => declaration.prop)).toEqual(['font-size'])
          expect(declarations.map(declaration => declaration.value)).toEqual([pipeline === 'h5' ? '0.8rem' : '1rem'])
        }
      })
      expect(paddings).toEqual([expected])
      expect(css).not.toContain('weapp-tailwindcss webpack-generated-css')
      expect(css).not.toMatch(/padding:\s*[\d.]+rpx\b/)
    }
    finally {
      vi.unstubAllEnvs()
      if (compiler) {
        await new Promise<void>((resolve, reject) => compiler!.close(error => error ? reject(error) : resolve()))
      }
      await rm(root, { recursive: true, force: true })
    }
  })
})
