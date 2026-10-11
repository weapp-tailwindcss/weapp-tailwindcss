import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  compileTailwindV4Source,
  getTailwindV4DesignSystemCacheKey,
  loadTailwindV4DesignSystem,
  loadTailwindV4NodeModule,
} from '@/v4'

const tempDirs: string[] = []

async function createTempDir(prefix: string) {
  const tempDir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), prefix)))
  tempDirs.push(tempDir)
  return tempDir
}

async function writeFile(file: string, content: string) {
  await fs.mkdir(path.dirname(file), { recursive: true })
  await fs.writeFile(file, content, 'utf8')
}

async function writeTailwindNodePackage(root: string, moduleCode: string) {
  const packageDir = path.join(root, 'node_modules/@tailwindcss/node')
  await writeFile(path.join(packageDir, 'package.json'), JSON.stringify({
    name: '@tailwindcss/node',
    type: 'module',
    main: './index.js',
    exports: './index.js',
  }))
  await writeFile(path.join(packageDir, 'index.js'), moduleCode)
}

function toPosixPath(file: string) {
  return file.replaceAll('\\', '/')
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map(tempDir => fs.rm(tempDir, { recursive: true, force: true })))
})

describe('Tailwind v4 node adapter', () => {
  it('loads @tailwindcss/node from the first resolvable base and caches the promise', async () => {
    const missingBase = await createTempDir('tw-engine-node-missing-')
    const packageRoot = await createTempDir('tw-engine-node-package-')
    await writeTailwindNodePackage(packageRoot, `
      export async function compile() {
        return { root: null, sources: [], build: () => '' }
      }
      export async function __unstable__loadDesignSystem() {
        return { parseCandidate: () => [], candidatesToCss: () => [] }
      }
    `)

    const first = await loadTailwindV4NodeModule([missingBase, packageRoot])
    const second = await loadTailwindV4NodeModule([missingBase, packageRoot])

    expect(first).toBe(second)
    expect(typeof first.compile).toBe('function')
  })

  it('falls back to the installed @tailwindcss/node package when no base can resolve it', async () => {
    const node = await loadTailwindV4NodeModule([])

    expect(typeof node.compile).toBe('function')
    expect(typeof node.__unstable__loadDesignSystem).toBe('function')
  })

  it('tries fallback bases when loading design systems and caches successful loads', async () => {
    const projectRoot = await createTempDir('tw-engine-node-design-project-')
    const firstBase = await createTempDir('tw-engine-node-design-first-')
    const secondBase = await createTempDir('tw-engine-node-design-second-')
    await writeTailwindNodePackage(projectRoot, `
      let calls = 0
      const failBase = ${JSON.stringify(toPosixPath(firstBase))}
      export async function compile() {
        return { root: null, sources: [], build: () => '' }
      }
      export async function __unstable__loadDesignSystem(css, { base }) {
        calls += 1
        if (base.replaceAll('\\\\', '/') === failBase) throw new Error('first base failed')
        return {
          calls,
          css,
          base,
          parseCandidate: () => [],
          candidatesToCss: () => []
        }
      }
    `)

    const source = {
      projectRoot,
      base: firstBase,
      baseFallbacks: [secondBase],
      css: '@import "tailwindcss";',
      dependencies: [],
    }
    const first = await loadTailwindV4DesignSystem(source)
    const second = await loadTailwindV4DesignSystem(source)

    expect(first).toBe(second)
    expect(first).toMatchObject({
      calls: 2,
      css: '@import "tailwindcss";',
      base: toPosixPath(secondBase),
    })
  })

  it('compiles with fallback CSS resolution, dependencies, and retry bases', async () => {
    const projectRoot = await createTempDir('tw-engine-node-compile-project-')
    const firstBase = await createTempDir('tw-engine-node-compile-first-')
    const secondBase = await createTempDir('tw-engine-node-compile-second-')
    await writeFile(path.join(projectRoot, 'node_modules/design-system/index.css'), '.button{}')
    await writeFile(path.join(projectRoot, 'node_modules/plain.css'), '.plain{}')
    await writeTailwindNodePackage(projectRoot, `
      import path from 'node:path'
      const failBase = ${JSON.stringify(toPosixPath(firstBase))}
      export async function compile(css, options) {
        if (options.base.replaceAll('\\\\', '/') === failBase) throw new Error('first base failed')
        const designSystemCss = await options.customCssResolver('design-system')
        const plainCss = await options.customCssResolver('plain.css')
        const relativeCss = await options.customCssResolver('./relative.css')
        const absoluteCss = await options.customCssResolver(path.join(options.base, 'absolute.css'))
        const missingCss = await options.customCssResolver('missing-package')
        options.onDependency('./relative-dependency.css')
        return {
          root: { base: options.base, pattern: './src' },
          sources: [{ base: options.base, pattern: './src/**/*.html', negated: false }],
          build: (candidates) => [
            css,
            designSystemCss,
            plainCss,
            String(relativeCss),
            String(absoluteCss),
            String(missingCss),
            candidates.join(' ')
          ].join('|')
        }
      }
      export async function __unstable__loadDesignSystem() {
        return { parseCandidate: () => [], candidatesToCss: () => [] }
      }
    `)

    const result = await compileTailwindV4Source({
      projectRoot,
      base: firstBase,
      baseFallbacks: [secondBase],
      css: '@import "tailwindcss";',
      dependencies: [path.join(projectRoot, 'seed.css')],
    })

    expect(result.compiled.root).toEqual({ base: toPosixPath(secondBase), pattern: './src' })
    expect(result.compiled.sources).toEqual([
      { base: toPosixPath(secondBase), pattern: './src/**/*.html', negated: false },
    ])
    const builtCss = toPosixPath(result.compiled.build(['text-red-500']))
    expect(builtCss).toContain(toPosixPath(path.join(projectRoot, 'node_modules/design-system/index.css')))
    expect(builtCss).toContain(toPosixPath(path.join(projectRoot, 'node_modules/plain.css')))
    expect(builtCss).toContain('undefined|undefined|undefined|text-red-500')
    expect(result.dependencies).toEqual(new Set([
      path.join(projectRoot, 'seed.css'),
      path.resolve('./relative-dependency.css'),
    ]))
  })

  it('throws explicit errors when no compile or design-system bases are available', async () => {
    const source = {
      projectRoot: '',
      base: '',
      baseFallbacks: [],
      css: '@import "tailwindcss";',
      dependencies: [],
    }

    await expect(loadTailwindV4DesignSystem(source)).rejects.toThrow('No base directories provided')
    await expect(compileTailwindV4Source(source)).rejects.toThrow('No base directories provided')
  })

  it('retries failed cached compile and design-system promises after cleanup', async () => {
    const projectRoot = await createTempDir('tw-engine-node-failing-project-')
    const base = await createTempDir('tw-engine-node-failing-base-')
    await writeTailwindNodePackage(projectRoot, `
      export async function compile() {
        throw new Error('compile failed')
      }
      export async function __unstable__loadDesignSystem() {
        throw new Error('design failed')
      }
    `)
    const source = {
      projectRoot,
      base,
      baseFallbacks: [],
      css: '@import "tailwindcss";',
      dependencies: [],
    }

    await expect(loadTailwindV4DesignSystem(source)).rejects.toThrow('design failed')
    await new Promise(resolve => setTimeout(resolve, 0))
    await expect(loadTailwindV4DesignSystem(source)).rejects.toThrow('design failed')
    await expect(compileTailwindV4Source(source)).rejects.toThrow('compile failed')
    await new Promise(resolve => setTimeout(resolve, 0))
    await expect(compileTailwindV4Source(source)).rejects.toThrow('compile failed')
  })

  it('throws generic adapter errors when Tailwind node throws non-Error values', async () => {
    const projectRoot = await createTempDir('tw-engine-node-non-error-project-')
    const base = await createTempDir('tw-engine-node-non-error-base-')
    await writeTailwindNodePackage(projectRoot, `
      export async function compile() {
        throw 'compile failed'
      }
      export async function __unstable__loadDesignSystem() {
        throw 'design failed'
      }
    `)
    const source = {
      projectRoot,
      base,
      baseFallbacks: [],
      css: '@import "tailwindcss";',
      dependencies: [],
    }

    await expect(loadTailwindV4DesignSystem(source)).rejects.toThrow('Failed to load Tailwind CSS v4 design system.')
    await expect(compileTailwindV4Source(source)).rejects.toThrow('Failed to compile Tailwind CSS v4 source.')
  })

  it('uses resolved base order in design system cache keys', () => {
    expect(getTailwindV4DesignSystemCacheKey({
      css: '@import "tailwindcss";',
      base: '/project',
      baseFallbacks: ['/project', '/fallback'],
    })).toBe(JSON.stringify({
      css: '@import "tailwindcss";',
      bases: [path.resolve('/project'), path.resolve('/fallback')],
    }))
  })
})
