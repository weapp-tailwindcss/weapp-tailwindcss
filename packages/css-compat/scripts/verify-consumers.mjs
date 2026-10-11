import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { execa } from 'execa'
import { install, pack, repositoryRoot } from './package-utils.mjs'

const tempRoot = await mkdtemp(path.join(tmpdir(), 'css-compat-consumers-'))
try {
  const tarball = await pack(tempRoot)
  const consumer = path.join(tempRoot, 'css-consumer')
  await install(consumer, { postcss: '8.5.29' }, { '@weapp-tailwindcss/css-compat': tarball })
  const consumerScript = path.join(consumer, 'consume.mjs')
  await writeFile(consumerScript, `import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import process from 'node:process'
import postcss from 'postcss'
import { compileCascadeLayers } from '@weapp-tailwindcss/css-compat'
const [name, input, selectors] = process.argv.slice(2)
const css = await readFile(input, 'utf8')
const expectedSelectors = JSON.parse(selectors)
    assert.match(css, /@layer/)
    const root = postcss.parse(css, { from: name + '.css' })
    const original = []
    root.walkRules(rule => original.push(rule.selector))
    const result = compileCascadeLayers(root, { mode: 'ordered', onConflict: 'error' })
    assert.deepEqual(result.diagnostics, [])
    assert.ok(!result.root.toString().includes('@layer'))
    const output = []
    root.walkRules(rule => output.push(rule.selector))
    assert.deepEqual(output.sort(), original.sort())
    for (const selector of expectedSelectors) {
      assert.ok(output.includes(selector), name + ': ' + selector)
    }
    console.log(JSON.stringify({ consumer: name, selectors: output, inputBytes: css.length, outputBytes: root.toString().length }))
`)
  async function check(name, css, expectedSelectors) {
    const input = path.join(consumer, `${name}.css`)
    await writeFile(input, css)
    const result = await execa('node', [consumerScript, name, input, JSON.stringify(expectedSelectors)], { cwd: consumer })
    console.log(result.stdout)
  }
  await check('native-css', '.probe{color:black}@layer a{.probe{color:red}}', ['.probe'])

  // 使用本 worktree 的 weapp-tailwindcss 生成引擎，禁止注册官方生成插件。
  const engineAPI = await import(pathToFileURL(path.join(repositoryRoot, 'packages', 'engine', 'dist', 'index.js')).href)
  const source = await engineAPI.resolveTailwindV4Source({
    projectRoot: repositoryRoot,
    base: repositoryRoot,
    css: '@layer base,utilities;@layer utilities{@tailwind utilities;}',
  })
  const engine = engineAPI.createTailwindV4Engine(source)
  try {
    const generated = await engine.generate({ candidates: ['flex', 'w-[13px]'] })
    await check('weapp-tailwindcss-engine', generated.css, ['.flex', '.w-\\[13px\\]'])
  }
  finally {
    engine.dispose()
  }

  const panda = path.join(tempRoot, 'panda-generator')
  await install(panda, { '@pandacss/dev': '2.1.2' })
  const pandaRequire = createRequire(path.join(panda, 'package.json'))
  assert.equal(pandaRequire('@pandacss/dev/package.json').version, '2.1.2')
  await writeFile(path.join(panda, 'panda.config.mjs'), `export default {
  preflight: false, include: [], outdir: 'styled-system', polyfill: false,
  staticCss: { css: [{ properties: { display: ['flex'], width: ['13px'], color: ['red', 'blue'] } }] },
}\n`)
  await execa('pnpm', ['exec', 'panda', 'cssgen', '--outfile', 'panda.css', '--minimal'], { cwd: panda })
  await check('panda-2.1.2', await readFile(path.join(panda, 'panda.css'), 'utf8'), ['.display_flex', '.width_13px', '.color_red', '.color_blue'])

  const facade = await import(pathToFileURL(path.join(repositoryRoot, 'packages', 'postcss', 'dist', 'transform.js')).href)
  const require = createRequire(import.meta.url)
  const cjsFacade = require(path.join(repositoryRoot, 'packages', 'postcss', 'dist', 'transform.cjs'))
  for (const adapter of [facade, cjsFacade]) {
    const root = adapter.postcss.parse('.x{color:black}@layer a{.x{color:red}}')
    adapter.consumeCascadeLayers(root)
    assert.equal(root.toString(), '.x{color:black}.x{color:red}')
  }
  console.log('PostCSS 发布 facade 保持 legacy anchor 输出')
}
finally {
  await rm(tempRoot, { recursive: true, force: true })
  console.log('已清理 CSS tarball 消费目录与 Panda 生成目录')
}
