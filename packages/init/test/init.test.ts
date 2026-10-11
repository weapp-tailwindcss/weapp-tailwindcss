import fs from 'fs-extra'
import get from 'get-value'
import path from 'pathe'
import { afterEach, describe, expect, it } from 'vitest'
import { getInitDefaults, init } from '@/index'
import { defaultDevDeps } from '@/npm'
import { createTempFixture, fetchOptions } from './util'

describe('init', () => {
  const defaults = getInitDefaults()
  const tempRoots: string[] = []

  afterEach(async () => {
    await Promise.all(tempRoots.splice(0).map(root => fs.remove(root)))
  })

  it('common', async () => {
    const cwd = await createTempFixture('init-common', {})
    tempRoots.push(cwd)

    await init({
      cwd,
      pkgJsonBasename: 'package.json',
      fetchOptions,
    })
    const cssEntryPath = path.resolve(cwd, defaults.cssEntryBasename)
    expect(await fs.exists(cssEntryPath)).toBe(true)
    expect(await fs.readFile(cssEntryPath, 'utf8')).toBe('@import "tailwindcss";\n@source "./**/*.{html,js,ts,jsx,tsx,vue,wxml}";\n')
    expect(await fs.exists(path.resolve(cwd, defaults.postcssConfigBasename))).toBe(false)
    expect(await fs.exists(path.resolve(cwd, defaults.tailwindConfigBasename))).toBe(false)
    const pkgJsonPath = path.resolve(cwd, 'package.json')
    expect(await fs.exists(pkgJsonPath)).toBe(true)
    const json = await fs.readJSON(pkgJsonPath)
    expect(json.scripts?.postinstall).toBeUndefined()
    for (const [key, value] of Object.entries(defaultDevDeps)) {
      const version = get(json, `devDependencies.${key}`) as string
      expect(version.slice(1).startsWith(value)).toBe(true)
    }
  })

  it('esm', async () => {
    const cwd = await createTempFixture('init-esm', { type: 'module' })
    tempRoots.push(cwd)

    await init({
      cwd,
      pkgJsonBasename: 'package.json',
      fetchOptions,
    })
    const cssEntryPath = path.resolve(cwd, defaults.cssEntryBasename)
    expect(await fs.exists(cssEntryPath)).toBe(true)
    expect(await fs.readFile(cssEntryPath, 'utf8')).toContain('@import "tailwindcss";')
    expect(await fs.exists(path.resolve(cwd, defaults.postcssConfigBasename))).toBe(false)
    expect(await fs.exists(path.resolve(cwd, defaults.tailwindConfigBasename))).toBe(false)
    const pkgJsonPath = path.resolve(cwd, 'package.json')
    expect(await fs.exists(pkgJsonPath)).toBe(true)
    const json = await fs.readJSON(pkgJsonPath)
    expect(json.type).toBe('module')
    expect(json.scripts?.postinstall).toBeUndefined()
    for (const [key, value] of Object.entries(defaultDevDeps)) {
      const version = get(json, `devDependencies.${key}`) as string
      expect(version.slice(1).startsWith(value)).toBe(true)
    }
  })

  it('legacy mode keeps the old PostCSS and Tailwind config workflow', async () => {
    const cwd = await createTempFixture('init-legacy', {})
    tempRoots.push(cwd)

    await init({
      cwd,
      pkgJsonBasename: 'package.json',
      mode: 'legacy',
      fetchOptions,
    })
    const postcssConfigPath = path.resolve(cwd, defaults.postcssConfigBasename)
    expect(await fs.exists(postcssConfigPath)).toBe(true)
    expect(await fs.readFile(postcssConfigPath, 'utf8')).toContain('autoprefixer: {}')
    const tailwindConfigPath = path.resolve(cwd, defaults.tailwindConfigBasename)
    expect(await fs.exists(tailwindConfigPath)).toBe(true)
    expect(await fs.readFile(tailwindConfigPath, 'utf8')).toContain('content:')
    expect(await fs.exists(path.resolve(cwd, defaults.cssEntryBasename))).toBe(false)
  })

  it('does not overwrite an existing v4 CSS entry', async () => {
    const cwd = await createTempFixture('init-existing-css', {})
    tempRoots.push(cwd)
    const cssEntryPath = path.resolve(cwd, defaults.cssEntryBasename)
    await fs.outputFile(cssEntryPath, '/* project-owned entry */\n')

    await init({
      cwd,
      pkgJsonBasename: 'package.json',
      fetchOptions,
    })

    expect(await fs.readFile(cssEntryPath, 'utf8')).toBe('/* project-owned entry */\n')
  })

  it('no-pkg-json', async () => {
    const tempRoot = path.resolve(process.cwd(), 'node_modules/.test-tmp')
    await fs.ensureDir(tempRoot)
    const cwd = await fs.mkdtemp(path.resolve(tempRoot, 'init-no-pkg-json-'))
    tempRoots.push(cwd)

    await init({
      cwd,
      pkgJsonBasename: 'package.json',
      fetchOptions,
    })
    expect(await fs.exists(path.resolve(cwd, defaults.postcssConfigBasename))).toBe(false)
    expect(await fs.exists(path.resolve(cwd, defaults.tailwindConfigBasename))).toBe(false)
    expect(await fs.exists(path.resolve(cwd, 'package.json'))).toBe(false)
  })
})
