import postcss from 'postcss'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { composeProcessedCssSources } from '../src/compat/processed-css/composition'
import { normalizeTailwindV4RuntimeCss, removeUnsupportedThemeVendorKeyframes } from '../src/compat/tailwindcss-v4/theme-source'
import { collectGeneratedCssClassCandidates } from '../src/compat/webpack-css/identity'
import { dedupeMiniProgramPreflightSelectorRules, ensureWebpackMiniProgramTwContentInit, hasMiniProgramPreflightSelector } from '../src/compat/webpack-css/preflight'
import { normalizeWebpackUserCssFallbackSource } from '../src/compat/webpack-css/user-source'

describe('webpack CSS compatibility without webpack state', () => {
  afterEach(() => vi.restoreAllMocks())

  it('cleans runtime layers and vendor theme keyframes in a single parse', () => {
    const parse = vi.spyOn(postcss, 'parse')
    const css = '@layer theme{@theme{@-webkit-keyframes spin{to{opacity:0}}@keyframes spin{to{opacity:0}}}}@-webkit-keyframes other{to{opacity:1}}'
    const result = normalizeTailwindV4RuntimeCss(css)
    expect(parse).toHaveBeenCalledTimes(1)
    expect(result).not.toContain('@layer')
    expect(result).not.toContain('@-webkit-keyframes spin')
    expect(result).toContain('@keyframes spin')
    expect(result).toContain('@-webkit-keyframes other')
    expect(removeUnsupportedThemeVendorKeyframes('@theme{')).toBe('@theme{')
    expect(() => normalizeTailwindV4RuntimeCss('@theme{')).toThrow()
  })

  it('keeps first preflight declarations and fills only missing properties', () => {
    const css = 'view,text,:after,:before{margin:0}view,text,::after,::before{margin:1px;padding:0}.a{content:var(--tw-content)}'
    const merged = dedupeMiniProgramPreflightSelectorRules(css)
    expect(merged).toContain('margin:0')
    expect(merged).not.toContain('margin:1px')
    expect(merged).toContain('padding:0')
    expect(hasMiniProgramPreflightSelector(merged)).toBe(true)
    const initialized = ensureWebpackMiniProgramTwContentInit(merged)
    expect(initialized).toContain("--tw-content:''")
    expect(ensureWebpackMiniProgramTwContentInit(initialized)).toBe(initialized)
  })

  it('returns candidates only from identified generated CSS and leaves runtime policy to callers', () => {
    expect([...collectGeneratedCssClassCandidates('.flex{display:flex}')]).toEqual([])
    expect([...collectGeneratedCssClassCandidates('/*! tailwindcss v4.3.3 */.flex{display:flex}')]).toEqual(['flex'])
    expect([...collectGeneratedCssClassCandidates('/*! weapp-tailwindcss webpack-generated-css */ /*! tailwindcss v4.3.3 */.flex{display:flex}')]).toEqual([])
  })

  it('combines processed author styles and keeps fallback import/layer behavior', () => {
    expect(composeProcessedCssSources()).toBeUndefined()
    expect(composeProcessedCssSources({ css: '.a{color:red}', processed: true }, { css: '.b{color:blue}', processed: false }))
      .toEqual({ css: '.a{color:red}\n.b{color:blue}', processed: false })
    expect(normalizeWebpackUserCssFallbackSource('@import "./a.css";@layer components{.a{color:red}}')).toBe('.a{color:red}')
  })
})
