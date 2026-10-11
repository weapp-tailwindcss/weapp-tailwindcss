import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
import {
  createPostcssTsdownConfigs,
  postcssBundledDependencies,
  postcssEsmOnlyDependencies,
} from '../tsdown.config.mts'

function matchesDependency(patterns: Array<RegExp | string>, id: string) {
  return patterns.some(pattern => typeof pattern === 'string' ? pattern === id : pattern.test(id))
}

const require = createRequire(import.meta.url)

describe('postcss tsdown config', () => {
  it('keeps the same external dependencies in ESM and CJS builds', () => {
    const [esm, cjs] = createPostcssTsdownConfigs()

    expect(esm.format).toEqual(['esm'])
    expect(esm.clean).toBe(true)
    expect(esm.dts).toBe(false)
    expect(esm.deps?.neverBundle).toBe(postcssEsmOnlyDependencies)
    expect(cjs.format).toEqual(['cjs'])
    expect(cjs.clean).toBe(false)
    expect(cjs.dts).toBe(false)
    expect(cjs.deps?.neverBundle).toBe(postcssEsmOnlyDependencies)
    expect(esm.deps?.resolveDepSubpath).toBe(true)
    expect(cjs.deps?.resolveDepSubpath).toBe(true)
    expect(matchesDependency(postcssEsmOnlyDependencies, '@csstools/css-color-parser')).toBe(false)
    expect(matchesDependency(postcssEsmOnlyDependencies, 'postcss-preset-env')).toBe(true)
    expect(matchesDependency(postcssEsmOnlyDependencies, 'postcss-rule-unit-converter')).toBe(false)
    expect(cjs.deps?.alwaysBundle).toBe(postcssBundledDependencies)
    expect(esm.deps?.alwaysBundle).toBe(postcssBundledDependencies)
    expect(matchesDependency(postcssBundledDependencies, 'postcss-plugin-shared')).toBe(true)
  })

  it('emits .js/.cjs and disables clean while watching', () => {
    const [esm] = createPostcssTsdownConfigs()

    expect(esm.outExtensions?.({ format: 'es' } as never).js).toBe('.js')
    expect(esm.outExtensions?.({ format: 'cjs' } as never).js).toBe('.cjs')
    expect(createPostcssTsdownConfigs({ watch: true }).every(config => config.clean === false)).toBe(true)
  })

  it('loads the bundled PostCSS unit plugins as CJS functions', () => {
    for (const packageName of [
      'postcss-rule-unit-converter',
      'postcss-rem-to-responsive-pixel',
      'postcss-pxtrans',
    ]) {
      const plugin = require(packageName)

      expect(typeof plugin, packageName).toBe('function')
      expect(plugin.__esModule, packageName).toBeUndefined()
    }

    const unitConverter = require('postcss-rule-unit-converter')
    expect(unitConverter.default).toBe(unitConverter)
  })
})
