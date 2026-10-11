import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build as viteBuild } from 'vite'
import { beforeAll, describe, expect, it } from 'vitest'
import { button, mergeClassNames, skeleton, tag } from '../src/variants'

const testDir = fileURLToPath(new URL('.', import.meta.url))
const packageRoot = resolve(testDir, '..')
const viteConfigPath = resolve(packageRoot, 'vite.config.ts')

let cssOutput = ''

async function snapshotPackageOutput() {
  const directory = resolve(packageRoot, 'dist')
  const entries = await readdir(directory, { recursive: true, withFileTypes: true }).catch(() => [])
  return Object.fromEntries(await Promise.all(entries.filter(entry => entry.isFile()).map(async (entry) => {
    const file = resolve(entry.parentPath, entry.name)
    return [file, createHash('sha256').update(await readFile(file)).digest('hex')]
  })))
}

beforeAll(async () => {
  const previousOutput = await snapshotPackageOutput()
  const result = await viteBuild({
    configFile: viteConfigPath,
    mode: 'test',
    logLevel: 'error',
    build: { write: false },
  })
  const bundles = Array.isArray(result) ? result : [result]
  expect(await snapshotPackageOutput()).toEqual(previousOutput)
  const assets = bundles.flatMap(bundle => 'output' in bundle ? bundle.output : [])
  const css = assets.find(asset => asset.type === 'asset' && asset.fileName === 'index.css')
  const wxss = assets.find(asset => asset.type === 'asset' && asset.fileName === 'index.wxss')
  expect(css?.type).toBe('asset')
  expect(wxss?.type).toBe('asset')
  if (css?.type !== 'asset' || wxss?.type !== 'asset') {
    throw new Error('UI 样式构建未返回 CSS 和 WXSS 产物。')
  }
  cssOutput = css.source.toString()
  expect(wxss.source.toString()).toBe(cssOutput)
})

describe('atomic CSS build', () => {
  it('contains design tokens', () => {
    expect(cssOutput).toContain('--wt-color-primary')
    expect(cssOutput).toContain('--wt-space-4')
    expect(cssOutput).toContain('--wt-radius-lg')
  })

  it('exposes core utilities', () => {
    expect(cssOutput).toContain('.wt-flex')
    expect(cssOutput).toContain('.wt-gap-2')
    expect(cssOutput).toContain('.wt-px-4')
  })

  it('exposes component recipes', () => {
    expect(cssOutput).toContain('.wt-button')
    expect(cssOutput).toContain('.wt-card__header')
    expect(cssOutput).toContain('.wt-toast')
  })

  it('ships advanced states and animations', () => {
    expect(cssOutput).toContain('.wt-button:active')
    expect(cssOutput).toContain('.wt-input.is-error')
    expect(cssOutput).toContain('@keyframes wt-skeleton-pulse')
  })
})

describe('variants utilities', () => {
  it('merges conflicting spacing classes', () => {
    expect(mergeClassNames('px-4', 'px-6')).toBe('px-6')
  })

  it('composes button variants with @weapp-tailwindcss/merge', () => {
    const classes = button({ tone: 'secondary', appearance: 'outline', class: 'px-4 px-6' })
    expect(classes.split(' ')).toContain('wt-button')
    expect(classes.split(' ')).toContain('wt-button--secondary')
    expect(classes.split(' ')).toContain('wt-button--outline')
    expect(classes).not.toMatch(/px-4/) // merged away
    expect(classes).toContain('px-6')
  })

  it('supports tag variants', () => {
    expect(tag({ tone: 'danger' })).toContain('wt-tag--danger')
    expect(tag({ tone: 'ghost' })).toContain('wt-tag--ghost')
  })

  it('supports skeleton tones', () => {
    expect(skeleton()).toBe('wt-skeleton')
    expect(skeleton({ tone: 'dark' })).toContain('wt-skeleton--dark')
  })
})
