import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import postcss from 'postcss'
import { createServer } from 'vite'
import { expect, it } from 'vitest'

const repository = path.resolve(import.meta.dirname, '..')

it.each([
  ['@weapp-tailwindcss/postcss-calc', 'postcss-calc', 'index.ts'],
  ['@weapp-tailwindcss/escape', 'escape', 'index.ts'],
  ['@weapp-tailwindcss/css-compat/legacy', 'css-compat', 'legacy.ts'],
])('Lynx E2E 使用真实配置解析 %s 源码，不依赖 workspace 包的预构建产物', async (specifier, packageName, source) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'lynx source import '))
  let server: Awaited<ReturnType<typeof createServer>> | undefined
  try {
    const packageDirectory = path.join(directory, 'node_modules', '@weapp-tailwindcss', packageName)
    await fs.mkdir(packageDirectory, { recursive: true })
    await fs.copyFile(path.join(repository, 'packages', packageName, 'package.json'), path.join(packageDirectory, 'package.json'))
    const importer = path.join(directory, 'entry.ts')
    await fs.writeFile(importer, `export * from ${JSON.stringify(specifier)}\n`)
    await expect(fs.stat(path.join(packageDirectory, 'dist'))).rejects.toMatchObject({ code: 'ENOENT' })
    server = await createServer({
      configFile: path.join(import.meta.dirname, 'vitest.e2e.config.ts'),
      root: directory,
      cacheDir: path.join(directory, 'cache'),
      logLevel: 'silent',
      server: { middlewareMode: true, hmr: false, watch: null },
      optimizeDeps: { noDiscovery: true, include: [] },
    })
    const resolved = await server.pluginContainer.resolveId(specifier, importer)
    expect(resolved).not.toBeNull()
    expect(path.normalize(resolved!.id)).toBe(path.join(repository, 'packages', packageName, 'src', source))
    await expect(fs.stat(path.join(packageDirectory, 'dist'))).rejects.toMatchObject({ code: 'ENOENT' })
  }
  finally {
    await server?.close()
    await fs.rm(directory, { recursive: true, force: true })
  }
})

it('Lynx 源码兼容管线实际归约 theme 变量与 calc，而非仅能解析包名', async () => {
  const { transformLynxCssCompat } = await import('../packages/postcss/src/compat/lynx-css')
  const css = transformLynxCssCompat(':root{--spacing:4px}.probe{width:calc(var(--spacing)*3)}')
  const declarations: string[] = []
  postcss.parse(css).walkDecls((declaration) => {
    declarations.push(`${declaration.prop}:${declaration.value}`)
  })
  expect(declarations).toEqual(['width:12px'])
})
