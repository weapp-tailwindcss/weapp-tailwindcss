import { mkdir, mkdtemp, symlink, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { postcss } from '@weapp-tailwindcss/postcss'
import { createCompiler } from '@/core/compiler'
import { getInternalCompilerSnapshot } from '@/core/compiler/snapshot'
import { resolveTailwindV4Source } from '@/generator'

const require = createRequire(import.meta.url)

const MINIMAL_THEME_CSS = `
@theme default {
  --color-red-500: oklch(63.7% 0.237 25.331);
  --spacing: 0.25rem;
}
@tailwind utilities;
`

async function createSource() {
  return resolveTailwindV4Source({
    base: process.cwd(),
    css: MINIMAL_THEME_CSS,
  })
}

describe('createCompiler', () => {
  it('scans @source directives from nested css entries', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'weapp-tw-core-nested-source-'))
    const appCss = path.join(root, 'app.css')
    const tailwindCss = path.join(root, 'styles/tailwind.css')
    await mkdir(path.join(root, 'styles/pages'), { recursive: true })
    await mkdir(path.join(root, 'node_modules'), { recursive: true })
    await symlink(path.dirname(require.resolve('tailwindcss/package.json')), path.join(root, 'node_modules/tailwindcss'), 'dir')
    await writeFile(appCss, '@import "./styles/tailwind.css";')
    await writeFile(tailwindCss, [
      '@import "tailwindcss" source(none);',
      '@source "./pages/**/*.{wxml,ts}";',
      '.sentinel { width: 11px; }',
    ].join('\n'))
    await writeFile(path.join(root, 'styles/pages/index.wxml'), '<view class="w-[37px] text-white" />')
    await writeFile(path.join(root, 'outside.wxml'), '<view class="w-[99px]" />')

    const compiler = createCompiler()
    const generated = await compiler.generate({
      id: 'nested-source',
      sourceOptions: {
        projectRoot: root,
        cssEntries: [appCss],
        packageName: 'tailwindcss',
      },
      target: 'web',
      scanSources: true,
    })
    expect(generated.classSet.has('w-[37px]')).toBe(true)
    expect(generated.classSet.has('text-white')).toBe(true)
    expect(generated.classSet.has('w-[99px]')).toBe(false)
    expect(generated.css).toContain('.w-\\[37px\\]')
    expect(generated.css.match(/\.sentinel/g)?.length).toBe(1)
    await compiler.dispose()
  })

  it('finalizes mini-program CSS by default and exposes explicit finalizers', async () => {
    const compiler = createCompiler()
    const weapp = compiler.createSnapshot({ classSet: [], id: 'root:weapp', target: 'weapp' })
    const tailwind = compiler.createSnapshot({ classSet: [], id: 'root:tailwind', target: 'tailwind' })
    const source = '@plugin "@iconify/tailwind4" { prefixes: mdi; }\n@source "./**/*.vue";\n.card { display: flex; }'

    const finalized = await compiler.transformCss(source, weapp)
    expect(finalized.css).not.toContain('@plugin')
    expect(finalized.css).not.toContain('@source')

    const optedOut = await compiler.transformCss(source, weapp, { finalize: false })
    expect(optedOut.css).toContain('@plugin')
    expect(optedOut.css).toContain('@source')

    const rawTailwind = await compiler.transformCss(source, tailwind)
    expect(rawTailwind.css).toContain('@plugin')
    expect(rawTailwind.css).toContain('@source')

    const rootInput = postcss.parse(source)
    const rootBefore = rootInput.toString()
    const finalizedRoot = compiler.finalizeCssRoot(rootInput, { isTailwindcssV4: true })
    expect(rootInput.toString()).toBe(rootBefore)
    expect(finalizedRoot.toString()).not.toContain('@plugin')
    expect(compiler.finalizeCss(source, { isTailwindcssV4: true })).not.toContain('@source')

    await compiler.dispose()
  })

  it('uses one explicit snapshot for generation and every transform', async () => {
    const compiler = createCompiler()
    const source = await createSource()
    const first = await compiler.generate({
      candidates: ['w-[100px]', 'text-red-500'],
      id: 'virtual:styles?root=main',
      scanSources: false,
      source,
      target: 'web',
    })

    expect(first.revision).toBe(1)
    expect(first.target).toBe('web')
    expect(first.cache).toEqual({ engine: false, output: false, source: false })
    expect(first.snapshot.roots).toEqual([{ id: 'virtual:styles?root=main', revision: 1 }])
    expect(first.css).toContain('.w-\\[100px\\]')
    expect(Object.isFrozen(first.snapshot)).toBe(true)
    expect(Object.isFrozen(first.snapshot.roots)).toBe(true)
    expect((first.snapshot.classSet as Set<string>).add).toBeUndefined()

    const css = await compiler.transformCss(first.css, first.snapshot)
    const template = await compiler.transformTemplate(
      '<view class="w-[100px] unknown"><text class="text-red-500" /></view>',
      first.snapshot,
    )
    const customAttributeTemplate = await compiler.transformTemplate(
      '<view data-class="w-[100px] unknown" />',
      first.snapshot,
      { customAttributesEntities: [['view', ['data-class']]] },
    )
    const script = await compiler.transformJavaScript(
      'const value = "w-[100px] unknown"',
      first.snapshot,
    )

    expect(css.css).toContain('.w-_b100px_B')
    expect(template).toContain('w-_b100px_B unknown')
    expect(customAttributeTemplate).toContain('w-_b100px_B unknown')
    expect(script.code).toContain('w-_b100px_B unknown')

    const inputRoot = postcss.parse(first.css)
    const inputCss = inputRoot.toString()
    const rootResult = await compiler.transformCssRoot(inputRoot, first.snapshot)
    rootResult.root.append({ selector: '.mutated', nodes: [] })
    const secondRootResult = await compiler.transformCssRoot(inputRoot, first.snapshot)
    expect(inputRoot.toString()).toBe(inputCss)
    expect(secondRootResult.css).not.toContain('.mutated')

    const repeated = await compiler.generate({
      candidates: ['w-[100px]', 'text-red-500'],
      id: 'virtual:styles?root=main',
      scanSources: false,
      source,
      target: 'web',
    })
    expect(repeated.revision).toBe(2)
    expect(repeated.cache).toEqual({ engine: true, output: true, source: true })

    await compiler.dispose()
  }, 30000)

  it('reuses the engine and preserves complete output when additions change rule order or candidates are deleted', async () => {
    const compiler = createCompiler()
    const source = await createSource()
    const request = {
      id: 'styles:subpackage',
      scanSources: false as const,
      source,
      target: 'weapp' as const,
    }
    const first = await compiler.generate({ ...request, candidates: ['p-4'] })
    const added = await compiler.generate({ ...request, candidates: ['p-4', 'm-2'] })
    const removed = await compiler.generate({ ...request, candidates: ['m-2'] })
    const complete = await compiler.generate({
      ...request,
      id: 'styles:complete-control',
      candidates: ['p-4', 'm-2'],
      incrementalCache: false,
    })

    expect(first.css).toContain('.p-4')
    expect(added.cache.engine).toBe(true)
    expect(added.incrementalCss).toBeUndefined()
    expect(added.css).toBe(complete.css)
    expect(added.rawCss).toBe(complete.rawCss)
    expect(added.css.indexOf('.m-2')).toBeGreaterThanOrEqual(0)
    expect(added.css.indexOf('.m-2')).toBeLessThan(added.css.indexOf('.p-4'))
    expect(removed.cache.engine).toBe(true)
    expect(removed.css).toContain('.m-2')
    expect(removed.css).not.toContain('.p-4')
    expect([first.revision, added.revision, removed.revision]).toEqual([1, 2, 3])

    const tailwind = await compiler.generate({
      ...request,
      candidates: ['w-[12px]'],
      target: 'tailwind',
    })
    expect(tailwind.css).toBe(tailwind.rawCss)
    expect(tailwind.incrementalCss).toBe(tailwind.incrementalRawCss)

    await compiler.dispose()
  }, 30000)

  it('merges reachable roots deterministically and keeps independent roots isolated', async () => {
    const compiler = createCompiler()
    const mainClasses = new Set(['w-[10px]'])
    const main = compiler.createSnapshot({
      classSet: mainClasses,
      dependencies: ['virtual:theme', 'C:\\repo\\tailwind.config.ts'],
      id: 'root:main',
      revision: 3,
      sources: [{ base: 'C:\\repo', negated: false, pattern: '**/*.tsx' }],
      target: 'weapp',
    })
    mainClasses.add('should-not-leak')
    const normal = compiler.createSnapshot({
      classSet: ['m-[2px]', 'w-[10px]'],
      dependencies: ['virtual:theme'],
      id: 'root:normal-subpackage',
      revision: 1,
      target: 'weapp',
    })
    const independent = compiler.createSnapshot({
      classSet: ['text-[13px]'],
      id: 'root:independent-subpackage',
      revision: 1,
      target: 'weapp',
    })
    const reachable = compiler.mergeSnapshots([normal, main, main])

    expect(reachable.roots).toEqual([
      { id: 'root:main', revision: 3 },
      { id: 'root:normal-subpackage', revision: 1 },
    ])
    expect([...reachable.classSet]).toEqual(['m-[2px]', 'w-[10px]'])
    expect(reachable.dependencies).toEqual(['C:\\repo\\tailwind.config.ts', 'virtual:theme'])
    expect(reachable.classSet.has('should-not-leak')).toBe(false)
    expect(getInternalCompilerSnapshot(reachable).fingerprint.length).toBe(32)

    const normalJs = await compiler.transformJavaScript('const c = "m-[2px] text-[13px]"', reachable)
    const independentJs = await compiler.transformJavaScript('const c = "m-[2px] text-[13px]"', independent)
    expect(normalJs.code).toContain('m-_b2px_B text-[13px]')
    expect(independentJs.code).toContain('m-[2px] text-_b13px_B')

    const conflictingRevision = compiler.createSnapshot({
      classSet: ['w-[10px]'],
      id: 'root:main',
      revision: 4,
      target: 'weapp',
    })
    const conflictingContent = compiler.createSnapshot({
      classSet: ['m-[2px]'],
      id: 'root:main',
      revision: 3,
      target: 'weapp',
    })
    const web = compiler.createSnapshot({ classSet: [], id: 'root:web', target: 'web' })
    expect(() => compiler.mergeSnapshots([main, conflictingRevision])).toThrow('不同 revision')
    expect(() => compiler.mergeSnapshots([main, conflictingContent])).toThrow('内容冲突')
    expect(() => compiler.mergeSnapshots([main, web])).toThrow('不同 target')

    await compiler.dispose()
  })

  it('treats root and dependency IDs as opaque values during invalidation', async () => {
    const compiler = createCompiler()
    const resolved = await createSource()
    const source = {
      ...resolved,
      dependencies: ['C:\\repo\\tailwind.config.ts', '/repo/theme.css', 'virtual:theme?raw'],
    }
    await compiler.generate({
      candidates: ['p-4'],
      id: 'C:\\bundle\\main.css?inline',
      scanSources: false,
      source,
    })

    expect(compiler.invalidate(['C:/repo/tailwind.config.ts'])).toEqual([])
    expect(compiler.invalidate(['C:\\repo\\tailwind.config.ts'])).toEqual(['C:\\bundle\\main.css?inline'])
    expect(compiler.invalidate(['/repo/theme.css', 'virtual:theme?raw'])).toEqual(['C:\\bundle\\main.css?inline'])
    expect(compiler.invalidate(['C:\\bundle\\main.css?inline'])).toEqual(['C:\\bundle\\main.css?inline'])

    await compiler.remove('C:\\bundle\\main.css?inline')
    await compiler.remove('C:\\bundle\\main.css?inline')
    expect(compiler.invalidate(['/repo/theme.css'])).toEqual([])
    await compiler.dispose()
    await compiler.dispose()
    expect(() => compiler.createSnapshot({ classSet: [], id: 'after-dispose' })).toThrow('已释放')
  }, 30000)

  it('invalidates roots when changed files match snapshot source globs', async () => {
    const compiler = createCompiler()
    const source = await createSource()
    const generated = await compiler.generate({
      candidates: ['p-4'],
      id: 'source-glob-root',
      scanSources: [
        { base: '/repo/src', negated: false, pattern: '**/*.{vue,js}' },
        { base: '/repo/src', negated: true, pattern: '**/generated/**' },
      ],
      source,
    })

    expect(generated.snapshot.sources).toEqual([
      { base: '/repo/src', negated: false, pattern: '**/*.{vue,js}' },
      { base: '/repo/src', negated: true, pattern: '**/generated/**' },
    ])
    expect(compiler.invalidate(['/repo/src/pages/index.vue?vue&type=template'])).toEqual(['source-glob-root'])
    expect(compiler.invalidate(['/repo/src/generated/cache.js'])).toEqual([])
    expect(compiler.invalidate(['/repo/outside/index.vue'])).toEqual([])
    expect(compiler.invalidate(['virtual:source-glob-root'])).toEqual([])

    await compiler.dispose()
  }, 30000)

  it('matches Windows source globs without normalizing opaque IDs', async () => {
    const compiler = createCompiler()
    const source = await createSource()
    await compiler.generate({
      candidates: ['p-4'],
      id: 'windows-source-root',
      scanSources: [{ base: 'C:\\repo\\src', negated: false, pattern: '**/*.vue' }],
      source,
    })

    expect(compiler.invalidate(['C:\\repo\\src\\pages\\index.vue?vue&type=template'])).toEqual(['windows-source-root'])
    expect(compiler.invalidate(['C:/repo/src/pages/index.vue'])).toEqual(['windows-source-root'])
    await compiler.dispose()
  }, 30000)

  it('resolves sourceOptions once and reuses the resolved source for the same request object', async () => {
    const compiler = createCompiler()
    const sourceOptions = { base: process.cwd(), css: MINIMAL_THEME_CSS }
    const first = await compiler.generate({
      candidates: ['w-[8px]'],
      id: 'source-options-root',
      scanSources: false,
      sourceOptions,
    })
    const second = await compiler.generate({
      candidates: ['w-[8px]'],
      id: 'source-options-root',
      scanSources: false,
      sourceOptions,
    })

    expect(first.cache.source).toBe(false)
    expect(second.cache).toEqual({ engine: true, output: true, source: true })
    await compiler.dispose()
  }, 30000)
})
