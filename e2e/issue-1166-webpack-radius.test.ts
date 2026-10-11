import type { Stats } from 'webpack'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { execa } from 'execa'
import MiniCssExtractPlugin from 'mini-css-extract-plugin'
import { expect, it } from 'vitest'
import webpack from 'webpack'

const require = createRequire(import.meta.url)
const { WeappTailwindcss } = require('weapp-tailwindcss/webpack')

it.each(['weapp', 'web'] as const)('issue #1166: preserves the %s loader handoff with upstream postcss-calc 8.2.4', async (target) => {
  const root = await mkdtemp(path.join(tmpdir(), 'weapp-tw-issue-1166-'))
  try {
    const manifest = path.join(root, 'package.json')
    await writeFile(manifest, JSON.stringify({
      private: true,
      dependencies: {
        'postcss': '8.5.28',
        'postcss-calc': '8.2.4',
        'postcss-pxtransform': '4.2.1',
        'tailwindcss': '4.3.3',
      },
    }))
    // 独立消费目录固定真实上游版本，不依赖仓库内安装的计算器。
    await execa('pnpm', ['install', '--ignore-scripts', '--config.minimumReleaseAge=0'], { cwd: root })
    const consumerRequire = createRequire(manifest)
    expect(consumerRequire('postcss-calc/package.json').version).toBe('8.2.4')
    const postcss = consumerRequire('postcss')
    const calc = consumerRequire('postcss-calc')
    const pxtransform = consumerRequire('postcss-pxtransform')
    const pxOptions = { platform: 'weapp', designWidth: 375, deviceRatio: { 375: 2 } }
    const rawCss = '.rounded-full{border-radius:calc(infinity * 1px)}'
    const transformed = await postcss([pxtransform(pxOptions)]).process(rawCss, { from: undefined })
    expect(transformed.css).toContain('calc(infinity * 2rpx)')
    const before = await postcss([calc()]).process(transformed.css, { from: undefined })
    expect(before.warnings().map((warning: { text: string }) => warning.text).join('\n')).toContain('Unrecognized text')

    const cssEntry = path.join(root, 'entry.css')
    await writeFile(cssEntry, '@import "tailwindcss" source(none);\n@source inline("rounded-full rounded-t-full rounded-s-full w-[10px]");')
    await writeFile(path.join(root, 'entry.js'), 'import "./entry.css"')
    let downstreamCss = ''
    const compiler = webpack({
      mode: 'development',
      context: root,
      entry: './entry.js',
      output: { path: path.join(root, 'output'), filename: 'bundle.js' },
      module: {
        rules: [{
          test: /\.css$/,
          use: [
            MiniCssExtractPlugin.loader,
            { loader: require.resolve('css-loader'), options: { importLoaders: 1 } },
            {
              loader: require.resolve('postcss-loader'),
              options: {
                implementation: postcss,
                postcssOptions: {
                  config: false,
                  plugins: [
                    {
                      postcssPlugin: 'observe-loader-handoff',
                      Once(css: { toString: () => string }) {
                        downstreamCss = css.toString()
                      },
                    },
                    ...(target === 'weapp' ? [pxtransform(pxOptions), calc()] : []),
                  ],
                },
              },
            },
          ],
        }],
      },
      plugins: [
        new MiniCssExtractPlugin({ filename: 'styles.acss' }),
        new WeappTailwindcss({
          appType: 'taro',
          tailwindcssBasedir: root,
          cssEntries: [cssEntry],
          generator: { target, webCompat: false },
        }),
      ],
    })!
    let stats: Stats | undefined
    try {
      stats = await new Promise<Stats | undefined>((resolve, reject) => {
        compiler.run((error, result) => error ? reject(error) : resolve(result))
      })
    }
    finally {
      await new Promise<void>((resolve, reject) => compiler.close(error => error ? reject(error) : resolve()))
    }
    expect(stats?.toJson({ all: false, errors: true }).errors).toEqual([])
    expect(stats?.toJson({ all: false, warnings: true }).warnings).toEqual([])
    const css = await readFile(path.join(root, 'output', 'styles.acss'), 'utf8')
    if (target === 'web') {
      expect(downstreamCss).toContain('calc(infinity * 1px)')
      expect(css).toContain('calc(infinity * 1px)')
      expect(css).toMatch(/width:\s*10px/)
      return
    }
    expect(downstreamCss).toContain('9999px')
    expect(downstreamCss).not.toContain('calc(infinity')
    const radii: string[] = []
    postcss.parse(css).walkDecls(/^border-.*radius$/, (decl: { value: string }) => radii.push(decl.value))
    expect(radii.length).toBeGreaterThanOrEqual(3)
    for (const value of radii) {
      expect(value).toMatch(/^\d+(?:\.\d+)?r?px$/)
      expect(Number.parseFloat(value)).toBeGreaterThan(0)
    }
    expect(css).toMatch(/width:\s*20rpx/)
  }
  finally {
    await rm(root, { recursive: true, force: true })
  }
}, 120_000)
