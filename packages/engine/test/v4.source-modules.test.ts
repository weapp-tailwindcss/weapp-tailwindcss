import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createTailwindV4Engine, resolveTailwindV4Source } from '../src/v4'
import { prepareGenerationModuleRequests } from '../src/v4/module-requests'

const packageRoot = path.resolve(import.meta.dirname, '..')
const tailwindImport = `@import ${JSON.stringify(createRequire(import.meta.url).resolve('tailwindcss/index.css').replaceAll('\\', '/'))};`
const directories: string[] = []
afterEach(async () => {
  await Promise.all(directories.splice(0).map(directory => rm(directory, { force: true, recursive: true })))
})

async function modules() {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'tailwind-source-modules-')))
  directories.push(root)
  const [a, b] = [path.join(root, 'a'), path.join(root, 'b')]
  await Promise.all([mkdir(a), mkdir(b)])
  await writeFile(path.join(a, 'plugin.mjs'), 'export default ({ addUtilities }) => addUtilities({ ".from-a": { width: "11px" } })')
  await writeFile(path.join(b, 'plugin.mjs'), 'export default ({ addUtilities }) => addUtilities({ ".from-b": { height: "13px" } })')
  await writeFile(path.join(b, 'config.mjs'), 'export default { theme: { extend: { spacing: { source: "17px" } } } }')
  return { root, a, b }
}

describe('CSS 来源的本地模块身份', () => {
  it('多入口同名插件与配置分别从各自 CSS 所在目录解析', async () => {
    const { root, a, b } = await modules()
    const entries = [path.join(a, 'entry.css'), path.join(b, 'entry.css')]
    await writeFile(entries[0]!, `${tailwindImport} @plugin "./plugin.mjs";`)
    await writeFile(entries[1]!, '@plugin "./plugin.mjs"; @config "./config.mjs";')
    const source = await resolveTailwindV4Source({ projectRoot: root, baseFallbacks: [packageRoot], cssEntries: entries })
    const engine = createTailwindV4Engine(source)
    try {
      const result = await engine.generate({ candidates: ['from-a', 'from-b', 'p-source'] })
      expect(result.css).toContain('width: 11px')
      expect(result.css).toContain('height: 13px')
      expect(result.css).toContain('padding: 17px')
      expect(result.dependencies).toEqual(expect.arrayContaining([path.join(a, 'plugin.mjs'), path.join(b, 'plugin.mjs'), path.join(b, 'config.mjs')]))
    }
    finally {
      engine.dispose?.()
    }
  })

  it('内存来源保留各自 file/base，显式 base 优先于虚拟文件目录', async () => {
    const { root, a, b } = await modules()
    const source = await resolveTailwindV4Source({
      projectRoot: root,
      baseFallbacks: [packageRoot],
      cssSources: [
        { file: path.join(a, 'virtual.css'), css: `${tailwindImport} @plugin "./plugin.mjs";` },
        { file: path.join(a, 'other.css'), base: b, css: '@plugin "./plugin.mjs"; @config "./config.mjs";' },
      ],
    })
    const engine = createTailwindV4Engine(source)
    try {
      const result = await engine.generate({ candidates: ['from-a', 'from-b', 'p-source'] })
      expect([...result.classSet]).toEqual(expect.arrayContaining(['from-a', 'from-b', 'p-source']))
      expect(result.css).toContain('width: 11px')
      expect(result.css).toContain('height: 13px')
      expect(result.css).toContain('padding: 17px')
    }
    finally {
      engine.dispose?.()
    }
  })

  it.each([
    { base: '/workspace/styles', request: '../plugin.mjs', expected: '/workspace/plugin.mjs' },
    { base: '/workspace/styles', request: '/plugin.mjs', expected: '/plugin.mjs' },
    { base: 'C:\\workspace\\styles', request: '../plugin.mjs', expected: 'C:\\workspace\\plugin.mjs' },
    { base: 'C:\\workspace\\styles', request: '/plugin.mjs', expected: 'C:\\plugin.mjs' },
    { base: '\\\\host\\share\\styles', request: '../plugin.mjs', expected: '\\\\host\\share\\plugin.mjs' },
  ])('模块身份覆盖不同文件系统路径：$base $request', ({ base, request, expected }) => {
    const prepared = prepareGenerationModuleRequests(`@plugin ${JSON.stringify(request)};`, base)
    expect(prepared.files).toEqual([expected])
    expect(prepared.css).toBe(`@plugin ${JSON.stringify(expected.replaceAll('\\', '/'))};`)
  })
})
