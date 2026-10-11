import fs from 'node:fs'
import { createRequire, isBuiltin } from 'node:module'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'
import { readImports } from '../../../../scripts/architecture/imports'
import { sourceFiles } from '../../../../scripts/architecture/workspace'

const repositoryRoot = path.resolve(__dirname, '../../../..')
const entries = [
  ['env', 'index'],
  ['weapp-tailwindcss', 'framework'],
  ['source-scan', 'index'],
  ['engine', 'index'],
  ['postcss', 'index'], ['postcss', 'syntax'], ['postcss', 'transform'], ['postcss', 'plugin'],
  ['weapp-style-injector', 'types'],
  ['weapp-tailwindcss', 'core'], ['weapp-tailwindcss', 'generator'],
  ['cli', 'index'],
] as const

describe('重构发布入口', () => {
  it.each(entries)('%s/%s 保持 ESM 与 CJS 导出兼容', async (directory, entry) => {
    const base = path.join(repositoryRoot, 'packages', directory)
    const require = createRequire(path.join(base, 'package.json'))
    const esm = await import(pathToFileURL(path.join(base, 'dist', `${entry}.js`)).href)
    const cjs = require(path.join(base, 'dist', `${entry}.cjs`))
    expect(Object.keys(cjs).filter(key => key !== 'default').sort()).toEqual(Object.keys(esm).filter(key => key !== 'default').sort())
    if (directory === 'postcss' && entry !== 'index' && entry !== 'plugin') {
      expect(esm).not.toHaveProperty('createWeappTailwindcssPostcssPlugin')
    }
  })
  it('产物值依赖具有生产声明，发布入口与相对块均存在', () => {
    for (const directory of new Set(entries.map(([directory]) => directory))) {
      const base = path.join(repositoryRoot, 'packages', directory)
      const manifest = JSON.parse(fs.readFileSync(path.join(base, 'package.json'), 'utf8'))
      const declared = new Set(Object.keys({ ...manifest.dependencies, ...manifest.peerDependencies, ...manifest.optionalDependencies }))
      for (const file of sourceFiles(path.join(base, 'dist')).filter(file => !file.endsWith('.d.ts') && !file.endsWith('.d.cts'))) {
        for (const edge of readImports(file, fs.readFileSync(file, 'utf8'))) {
          if (edge.typeOnly || isBuiltin(edge.specifier)) continue
          if (edge.specifier.startsWith('.')) {
            expect(fs.existsSync(path.resolve(path.dirname(file), edge.specifier)), `${file}: ${edge.specifier}`).toBe(true)
          }
          else {
            const name = edge.specifier.startsWith('@') ? edge.specifier.split('/').slice(0, 2).join('/') : edge.specifier.split('/')[0]!
            expect(declared.has(name) || name === manifest.name, `${file}: ${name}`).toBe(true)
          }
        }
      }
    }
  })
})
