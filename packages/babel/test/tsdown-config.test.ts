import { describe, expect, it } from 'vitest'
import {
  babelEsmOnlyDependencies,
  babelOutExtensions,
  createBabelTsdownConfigs,
} from '../tsdown.config.mts'

function matchesDependency(patterns: Array<RegExp | string>, id: string) {
  return patterns.some(pattern => typeof pattern === 'string' ? pattern === id : pattern.test(id))
}

describe('Babel tsdown config', () => {
  it('emits ESM .js, CJS .cjs and declarations once', () => {
    const [esm, cjs] = createBabelTsdownConfigs()

    expect(esm.format).toEqual(['esm'])
    expect(esm.clean).toBe(true)
    expect(esm.dts).toBe(true)
    expect(cjs.format).toEqual(['cjs'])
    expect(cjs.clean).toBe(false)
    expect(cjs.dts).toBe(false)
    expect(babelOutExtensions({ format: 'es' }).js).toBe('.js')
    expect(babelOutExtensions({ format: 'cjs' }).js).toBe('.cjs')
  })

  it('externalizes Babel 8 from ESM and bundles its ESM-only graph into CJS', () => {
    const [esm, cjs] = createBabelTsdownConfigs()

    expect(esm.deps?.neverBundle).toBe(babelEsmOnlyDependencies)
    expect(cjs.deps?.alwaysBundle).toBe(babelEsmOnlyDependencies)
    expect(esm.deps?.resolveDepSubpath).toBe(true)
    expect(cjs.deps?.resolveDepSubpath).toBe(true)
    expect(matchesDependency(babelEsmOnlyDependencies, '@babel/parser')).toBe(true)
    expect(matchesDependency(babelEsmOnlyDependencies, '@babel/traverse')).toBe(true)
    expect(matchesDependency(babelEsmOnlyDependencies, 'obug')).toBe(true)
  })

  it('disables clean while watching', () => {
    expect(createBabelTsdownConfigs({ watch: true }).every(config => config.clean === false)).toBe(true)
  })
})
