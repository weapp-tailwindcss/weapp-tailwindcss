import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { runInNewContext } from 'node:vm'
import { parseSync } from '@babel/core'
import { expect, it } from 'vitest'
import { repo } from './catalog.mjs'

const demoRequire = createRequire(path.join(repo, 'demo/web/nuxt-vite-tailwindcss-v4/package.json'))
const nuxtRequire = createRequire(demoRequire.resolve('nuxt/package.json'))
const serverRequire = createRequire(nuxtRequire.resolve('@nuxt/nitro-server/package.json'))
const nitroRequire = createRequire(serverRequire.resolve('nitropack/package.json'))
const nitroPackage = nitroRequire('nitropack/package.json')
const source = readFileSync(path.resolve(path.dirname(nitroRequire.resolve('nitropack/package.json')), nitroPackage.exports['./rollup'].import), 'utf8')
const ast = parseSync(source, { babelrc: false, configFile: false, sourceType: 'module' })
const declarations = ['normalizeMatcher', 'externals$1'].map((name) => {
  const node = ast.program.body.find(node => node.type === 'FunctionDeclaration' && node.id.name === name)
  if (!node) {
    throw new Error(`Nitro externals implementation missing: ${name}`)
  }
  return source.slice(node.start, node.end)
})
// 执行发行包的真实 resolver；文件有效性由桩提供，跨系统重现 Windows module ID。
const createExternals = runInNewContext(`${declarations.join('\n')}\nexternals$1`, {
  ...nitroRequire('pathe'),
  RegExp,
  existsSync: () => true,
  isDirectory: async () => false,
  isValidNodeImport: async () => true,
  normalizeid: id => id,
})

const renderer = 'nuxt/dist/runtime/server/renderer/index.js'
const resolvedIds = [
  `/workspace/node_modules/${renderer}`,
  `D:/workspace/node_modules/${renderer}`,
  String.raw`D:\workspace\node_modules\nuxt\dist\runtime\server\renderer\index.js`,
  String.raw`D:\workspace\node_modules\.pnpm\nuxt@4.6.0\node_modules\nuxt\dist\runtime\server\renderer\index.js`,
  String.raw`\node_modules\nuxt\dist\runtime\server\renderer\index.js`,
  String.raw`\\server\share\node_modules\nuxt\dist\runtime\server\renderer\index.js`,
]

it.each(resolvedIds)('keeps the Nuxt renderer in the transform graph after resolving %s', async (id) => {
  const plugin = createExternals({ inline: ['nuxt/dist'], trace: false })
  const result = await plugin.resolveId.call({ resolve: async () => ({ id }) }, 'nuxt/internal/renderer', '/app/entry.mjs', {})
  expect(result).toBeNull()
})

it('continues externalizing valid packages outside the inline boundary', async () => {
  const id = '/workspace/node_modules/vue/server-renderer/index.mjs'
  const plugin = createExternals({ inline: ['nuxt/dist'], trace: false })
  const result = await plugin.resolveId.call({ resolve: async () => ({ id }) }, 'vue/server-renderer', '/app/entry.mjs', {})
  expect(result).toEqual({ id, external: true })
})

it('preserves more specific external rules for the resolved module', async () => {
  const id = '/workspace/node_modules/nuxt/dist/runtime/server/renderer/index.js'
  const plugin = createExternals({ inline: ['nuxt/dist'], external: ['nuxt/dist/runtime/server/renderer'], trace: false })
  const result = await plugin.resolveId.call({ resolve: async () => ({ id }) }, 'nuxt/internal/renderer', '/app/entry.mjs', {})
  expect(result).toEqual({ id, external: true })
})

it('leaves relative imports to Rollup without external resolution', async () => {
  const plugin = createExternals({ inline: ['nuxt/dist'], trace: false })
  const result = await plugin.resolveId.call({
    resolve: () => { throw new Error('Unexpected resolution') },
  }, './renderer.js', '/app/entry.mjs', {})
  expect(result).toBeNull()
})
