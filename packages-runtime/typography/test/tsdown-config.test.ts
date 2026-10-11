import { describe, expect, it } from 'vitest'
import {
  createTypographyTsdownConfigs,
  htmlparser2EsmOnlyDependencies,
  typographyCjsBundledDependencies,
  typographyExternalDependencies,
} from '../tsdown.config.mts'

describe('typography tsdown config', () => {
  it('keeps dependencies external in ESM and only bundles htmlparser2 for CJS', () => {
    const [pluginEsm, pluginCjs, transformEsm, transformCjs] = createTypographyTsdownConfigs()

    expect(pluginEsm.format).toEqual(['esm'])
    expect(pluginEsm.entry).toEqual(['src/index.cjs'])
    expect(pluginEsm.deps?.neverBundle).toEqual([
      ...htmlparser2EsmOnlyDependencies,
      'magic-string',
      ...typographyExternalDependencies,
    ])
    expect(pluginCjs.format).toEqual(['cjs'])
    expect(pluginCjs.deps?.alwaysBundle).toBe(typographyCjsBundledDependencies)
    expect(pluginCjs.deps?.neverBundle).toBe(typographyExternalDependencies)
    expect(pluginEsm.deps?.resolveDepSubpath).toBe(true)
    expect(pluginCjs.deps?.resolveDepSubpath).toBe(true)
    expect(transformEsm.dts).toBe(true)
    expect(transformCjs.dts).toBe(false)
  })

  it('emits .js/.cjs and only cleans once outside watch mode', () => {
    const configs = createTypographyTsdownConfigs()
    const outExtensions = configs[0].outExtensions

    expect(configs[0].clean).toBe(true)
    expect(configs.slice(1).every(config => config.clean === false)).toBe(true)
    expect(outExtensions?.({ format: 'es' } as never).js).toBe('.js')
    expect(outExtensions?.({ format: 'cjs' } as never).js).toBe('.cjs')
    expect(createTypographyTsdownConfigs({ watch: true }).every(config => config.clean === false)).toBe(true)
  })
})
