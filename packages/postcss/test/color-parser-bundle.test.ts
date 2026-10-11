import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { execa } from 'execa'
import { build } from 'tsdown'
import { expect, it } from 'vitest'
import { createPostcssTsdownConfigs } from '../tsdown.config.mts'

const require = createRequire(import.meta.url)
const packageRoot = fileURLToPath(new URL('../', import.meta.url))

it('独立安装存在第二份 parser 实例时，ESM/CJS 产物仍能转换颜色', async () => {
  const temporary = await mkdtemp(path.join(tmpdir(), 'postcss-color-bundle-'))
  try {
    const modules = path.join(temporary, 'node_modules')
    await mkdir(path.join(modules, '@csstools'), { recursive: true })
    for (const name of ['@csstools/css-color-parser', '@csstools/css-tokenizer', 'postcss-value-parser', 'postcss']) {
      const entry = require.resolve(name)
      const root = path.resolve(path.dirname(entry), '..')
      await symlink(root, path.join(modules, name), 'junction')
    }
    // 模拟 pnpm 为不同 tokenizer peer 创建的 parser 实例，不修改依赖源码行为。
    const parserRoot = path.join(modules, '@csstools/css-parser-algorithms')
    await mkdir(parserRoot)
    await writeFile(path.join(parserRoot, 'package.json'), JSON.stringify({ type: 'module', exports: './index.mjs' }))
    await writeFile(path.join(parserRoot, 'index.mjs'), await readFile(require.resolve('@csstools/css-parser-algorithms')))

    for (const config of createPostcssTsdownConfigs().slice(0, 2)) {
      const format = config.format[0]
      const outDir = path.join(temporary, format)
      await build({
        ...config,
        config: false,
        cwd: packageRoot,
        entry: { color: path.join(packageRoot, 'src/compat/color-mix.ts') },
        outDir,
        logLevel: 'silent',
      })
      await writeFile(path.join(outDir, 'package.json'), '{"type":"module"}')
      const entry = pathToFileURL(path.join(outDir, format === 'esm' ? 'color.js' : 'color.cjs')).href
      const { stdout } = await execa(process.execPath, ['--input-type=module', '-e', `
        const { normalizeModernColorValue } = await import(${JSON.stringify(entry)});
        console.log(JSON.stringify(normalizeModernColorValue('oklch(62.3% 0.214 259.815)')));
      `])
      expect(JSON.parse(stdout), format).toEqual({ value: 'rgb(50, 128, 255)', changed: true, hasUnsupported: false })
    }
  }
  finally {
    await rm(temporary, { recursive: true, force: true })
  }
})
