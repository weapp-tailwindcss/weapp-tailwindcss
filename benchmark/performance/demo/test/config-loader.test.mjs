import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { build } from 'esbuild'
import { expect, it, vi } from 'vitest'
import { configure } from '../configs.mjs'

it('Gulp 的 ESM TypeScript 任务参与配置捕获并能恢复原文', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'cost-gulp-config-'))
  try {
    const entry = path.join(root, 'gulpfile.mjs')
    const tasks = path.join(root, 'gulpfile.mts')
    const bootstrap = 'await import(\'./gulpfile.mts\')\n'
    const source = 'import { createPlugins } from "weapp-tailwindcss/gulp"; export const plugins = createPlugins({})'
    await writeFile(entry, bootstrap)
    await writeFile(tasks, source)
    const restore = await configure({ root, project: root, item: { family: 'gulp' } }, 'capture')
    expect(await readFile(entry, 'utf8')).toBe(bootstrap)
    expect(await readFile(tasks, 'utf8')).toContain('./.cost/module-0.mjs')
    expect(await readFile(path.join(root, '.cost', 'module-0.mjs'), 'utf8')).toContain('export const createPlugins')
    await restore()
    expect(await readFile(tasks, 'utf8')).toBe(source)
  }
  finally { await rm(root, { recursive: true, force: true }) }
})

it('weapp-vite 的内嵌选项经过 ESM 配置打包后仍由 Node 加载 CJS 捕获模块', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'cost-weapp-config-'))
  try {
    const file = path.join(root, 'vite.config.ts')
    await writeFile(path.join(root, 'package.json'), '{"type":"module"}')
    await writeFile(file, 'export default { tailwindcss: { cssEntries: ["entry.css"] } }')
    const recordsFile = path.join(root, 'options.jsonl')
    vi.stubEnv('WEAPP_DEMO_COST_CAPTURE', recordsFile)
    const restore = await configure({ root, project: root, item: { family: 'weapp-vite' } }, 'capture')
    const outfile = path.join(root, 'captured.mjs')
    await build({ entryPoints: [file], outfile, bundle: true, platform: 'node', format: 'esm', logLevel: 'silent' })
    const { stdout } = await promisify(execFile)(process.execPath, ['--input-type=module', '-e', `const {default:config} = await import(${JSON.stringify(pathToFileURL(outfile).href)}); console.log(JSON.stringify(config))`])
    expect(JSON.parse(stdout).tailwindcss.cssEntries).toEqual(['entry.css'])
    expect(JSON.parse((await readFile(recordsFile, 'utf8')).trim()).value.options.cssEntries).toEqual(['entry.css'])
    await restore()
    await configure({ root, project: root, item: { family: 'weapp-vite' } }, 'disabled')
    expect(await readFile(file, 'utf8')).toBe('export default { tailwindcss: false }')
  }
  finally { vi.unstubAllEnvs(); await rm(root, { recursive: true, force: true }) }
})

it.each(['esm', 'cjs'])('真实配置打包后 %s 捕获器可以加载 Node 内建模块，禁用组无需安装插件', async (format) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'cost-config-'))
  try {
    const pkg = path.join(root, 'node_modules', 'weapp-tailwindcss')
    await mkdir(pkg, { recursive: true })
    await writeFile(path.join(root, 'package.json'), JSON.stringify({ type: 'module' }))
    await writeFile(path.join(pkg, 'package.json'), JSON.stringify({ name: 'weapp-tailwindcss', exports: { './vite': './index.cjs' } }))
    await writeFile(path.join(pkg, 'index.cjs'), 'exports.WeappTailwindcss = options => [{ name: "published", options }]')
    const file = path.join(root, `vite.config.${format === 'esm' ? 'ts' : 'cjs'}`)
    await writeFile(file, format === 'esm'
      ? 'import { WeappTailwindcss } from "weapp-tailwindcss/vite"; export default WeappTailwindcss({ cssEntries: ["entry.css"] })'
      : 'const { WeappTailwindcss } = require("weapp-tailwindcss/vite"); module.exports = WeappTailwindcss({ cssEntries: ["entry.css"] })')
    const consumer = { root, project: root, item: { family: 'uni' } }
    const recordsFile = path.join(root, 'options.jsonl')
    vi.stubEnv('WEAPP_DEMO_COST_CAPTURE', recordsFile)
    const load = async (name) => {
      const outfile = path.join(root, '.cost', `${name}.mjs`)
      await build({ entryPoints: [file], outfile, bundle: true, platform: 'node', format: 'esm', logLevel: 'silent' })
      return (await import(pathToFileURL(outfile).href)).default
    }
    const restore = await configure(consumer, 'capture')
    expect((await load('captured'))[0].name).toBe('published')
    const records = (await readFile(recordsFile, 'utf8')).trim().split('\n').map(line => JSON.parse(line))
    expect(records[0].value.options.cssEntries).toEqual(['entry.css'])
    await restore()
    await rm(path.join(root, 'node_modules'), { recursive: true })
    await configure(consumer, 'disabled', records)
    expect(await load('disabled')).toEqual([])
  }
  finally { vi.unstubAllEnvs(); await rm(root, { recursive: true, force: true }) }
})
