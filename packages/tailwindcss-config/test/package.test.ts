import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const dirname = path.dirname(fileURLToPath(import.meta.url))
const packageRoot = path.resolve(dirname, '..')

describe('package output contract', () => {
  it('keeps esm build output aligned with publish exports', () => {
    const packageJson = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8'))
    const tsdownConfig = fs.readFileSync(path.join(packageRoot, 'tsdown.config.ts'), 'utf8')

    expect(packageJson.publishConfig.exports['.'].import).toEqual({
      types: './dist/index.d.ts',
      default: './dist/index.js',
    })
    expect(packageJson.publishConfig.exports['.'].require).toEqual({
      types: './dist/index.d.cts',
      default: './dist/index.cjs',
    })
    expect(packageJson.publishConfig.module).toBe('./dist/index.js')
    expect(tsdownConfig).toContain("format === 'es' ? '.js' : '.cjs'")
  })
})
