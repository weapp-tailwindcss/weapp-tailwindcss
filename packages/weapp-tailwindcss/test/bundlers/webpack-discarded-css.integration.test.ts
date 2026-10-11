import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { expect, it } from 'vitest'
import webpack from 'webpack'

const require = createRequire(import.meta.url)
const { WeappTailwindcss } = require('weapp-tailwindcss/webpack')

it.each([true, false])('processes compiled CSS after Sass with discarded output=%s', async (discard) => {
  const root = await mkdtemp(path.join(process.cwd(), '.tmp-webpack-discarded-css-'))
  const nullLoader = path.join(root, 'node_modules/null-loader/index.cjs')
  await mkdir(path.dirname(nullLoader), { recursive: true })
  await writeFile(nullLoader, 'module.exports = function () { return "" }')
  await writeFile(path.join(root, 'entry.js'), 'import style from "./theme.scss"; console.log("server-entry h-8", style)')
  await writeFile(path.join(root, 'theme.scss'), '// Sass-only comment\n@import "tailwindcss";\n$ink: red;\n.card { color: $ink; }')
  const compiler = webpack({
    mode: 'development',
    target: 'node',
    context: root,
    entry: './entry.js',
    output: { path: path.join(root, 'dist'), filename: 'server.js' },
    module: {
      rules: [{ test: /\.scss$/, type: discard ? 'javascript/auto' : 'asset/source', use: [...(discard ? [nullLoader] : []), { loader: require.resolve('sass-loader', { paths: [path.resolve('website')] }), options: { sassOptions: { silenceDeprecations: ['import'] } } }] }],
    },
    plugins: [new WeappTailwindcss({ tailwindcssBasedir: root, generator: { target: 'web' } })],
  })
  try {
    const stats = await new Promise<webpack.Stats | undefined>((resolve, reject) => {
      compiler.run((error, stats) => error ? reject(error) : resolve(stats))
    })
    expect(stats?.hasErrors(), stats?.toString({ all: false, errors: true })).toBe(false)
    const js = await readFile(path.join(root, 'dist/server.js'), 'utf8')
    expect(js).toContain('server-entry')
    expect(js).not.toContain('Sass-only comment')
    if (!discard) {
      expect(js).toContain('.card')
      expect(js).toContain('color: red')
      expect(js).toContain('.h-8')
    }
  }
  finally {
    await new Promise<void>((resolve, reject) => compiler.close(error => error ? reject(error) : resolve()))
    await rm(root, { recursive: true, force: true })
  }
}, 30_000)
