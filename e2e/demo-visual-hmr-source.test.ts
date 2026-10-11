import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { createUniH5HmrVisualConfig } from '../scripts/demo-visual-e2e-report/hmr'
import { webCases } from './hbuilderx-local/cases'
import { matchRuntimeStyles, readRuntimeStyles } from './hbuilderx-local/web/runtime'

describe('HBuilderX visual HMR source', () => {
  it('accepts v4 variable spacing and raw Web rpx selectors without accepting a different value', () => {
    const item = webCases.find(item => item.name === 'uni-app-x-vdom-tailwindcss-v4')!
    const spacing = item.hmrSteps[0]!.cssContains[0] as RegExp
    expect(spacing.test('margin-top: calc(var(--spacing) * 200);')).toBe(true)
    expect(spacing.test('margin-top: calc(0.25rem * 200);')).toBe(true)
    expect(spacing.test('margin-top: 800px;')).toBe(true)
    expect(spacing.test('margin-top: calc(var(--spacing) * 2);')).toBe(false)
    const rpx = item.hmrSteps.at(-1)!.cssContains[1] as RegExp
    expect(rpx.test(String.raw`.mt-\[10rpx\] { margin-top: 0.3125rem; }`)).toBe(true)
    expect(rpx.test('.mt-_b10rpx_B { margin-top: 0.3125rem; }')).toBe(true)
    expect(rpx.test('.mt-_b10rpx_B { margin-top: 10px; }')).toBe(false)
  })

  it('applies same-file and CSS theme mutations and restores every touched source', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'visual-hmr-mutations-'))
    const name = 'uni-app-x-vdom-tailwindcss-v4'
    const item = webCases.find(item => item.name === name)!
    const file = path.resolve(root, item.sourceFile)
    const cssFile = path.resolve(root, 'main.css')
    const original = `<template>\r\n${item.markerAnchor}\r\n</template>\r\n<style>@reference "../../main.css";</style>\r\n`
    const css = '@import "tailwindcss";\r\n'
    try {
      await fs.mkdir(path.dirname(file), { recursive: true })
      await fs.writeFile(file, original)
      await fs.writeFile(cssFile, css)
      const config = createUniH5HmrVisualConfig(root, name)!
      const restore = await config.mutate(root, 0)
      expect(await fs.readFile(file, 'utf8')).toContain('@import "../../main.css";')
      await config.mutate(root, 1)
      expect(await fs.readFile(cssFile, 'utf8')).toContain('--color-issue-1021-hmr: #0f5132')
      expect(await fs.readFile(cssFile, 'utf8')).not.toMatch(/(?<!\r)\n/)
      await restore()
      expect(await fs.readFile(file, 'utf8')).toBe(original)
      expect(await fs.readFile(cssFile, 'utf8')).toBe(css)
    }
    finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  })

  it('uses the rpx reference viewport and validates all declared runtime properties', async () => {
    const config = createUniH5HmrVisualConfig('', 'uni-app-x-vdom-tailwindcss-v4')!
    expect(config.viewport?.width).toBe(375)
    const assertion = {
      selector: '.probe',
      scopeAttribute: /^data-v-/,
      styles: { paddingLeft: '15px', borderTopColor: 'rgb(124, 58, 237)' },
    }
    const actual = { ...assertion.styles, __attributeNames: ['data-v-123'] }
    const page = {
      evaluate: async (_callback: unknown, request: { properties: string[], selector: string }) => {
        expect(request).toEqual({ selector: assertion.selector, properties: ['paddingLeft', 'borderTopColor'] })
        return actual
      },
    }
    expect(await readRuntimeStyles(page as Parameters<typeof readRuntimeStyles>[0], assertion)).toEqual(actual)
    expect(matchRuntimeStyles(actual, assertion)).toBe(true)
    expect(matchRuntimeStyles({ ...actual, paddingLeft: '0px' }, assertion)).toBe(false)
    expect(matchRuntimeStyles({ ...actual, __attributeNames: [] }, assertion)).toBe(false)
  })

  it('replaces one live probe across steps and restores the original source', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'visual-hmr-source-'))
    const name = 'uni-app-vite-vue3-hbuilderx-tailwindcss-v4'
    const item = webCases.find(item => item.name === name)!
    const file = path.resolve(root, item.sourceFile)
    const original = `<template>\r\n\t\t${item.markerAnchor}\r\n</template>\r\n`
    let restore: (() => Promise<void>) | undefined
    try {
      await fs.mkdir(path.dirname(file), { recursive: true })
      await fs.writeFile(file, original)
      const config = createUniH5HmrVisualConfig(root, name)!
      for (let index = 0; index < item.hmrSteps.length; index++) {
        const rollback = await config.mutate(root, index)
        restore ??= rollback
        const source = await fs.readFile(file, 'utf8')
        expect(source.match(/class="hbuilderx-web-hmr-probe /g)).toHaveLength(1)
        expect(source).toContain(item.hmrSteps[index]!.markerText)
        if (index > 0) {
          expect(source).not.toContain(item.hmrSteps[index - 1]!.markerText)
        }
        expect(source).not.toMatch(/(?<!\r)\n/)
      }
      await restore!()
      expect(await fs.readFile(file, 'utf8')).toBe(original)
    }
    finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  })
})
