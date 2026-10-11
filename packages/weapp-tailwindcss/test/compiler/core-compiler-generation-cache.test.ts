import type { Compiler, CompilerGenerateRequest } from '@/core/compiler'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createCompiler } from '@/core/compiler'

describe('compiler mutable generation inputs', () => {
  const compilers: Compiler[] = []
  const directories: string[] = []

  afterEach(async () => {
    await Promise.all(compilers.splice(0).map(compiler => compiler.dispose()))
    await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
  })

  function createCase() {
    const compiler = createCompiler()
    compilers.push(compiler)
    const request: CompilerGenerateRequest = {
      id: 'generation-root',
      sourceOptions: { css: '@tailwind utilities;', base: process.cwd() },
      scanSources: false,
      candidates: [],
      target: 'web',
    }
    return { compiler, request }
  }

  async function createScanCase() {
    const directory = await mkdtemp(path.join(tmpdir(), 'weapp-tw-compiler-scan-cache-'))
    directories.push(directory)
    const firstFile = path.join(directory, 'first.html')
    const secondFile = path.join(directory, 'second.html')
    await writeFile(firstFile, '<view class="w-[10px]" />')
    await writeFile(secondFile, '<view class="w-[20px]" />')
    const { compiler, request } = createCase()
    const rule = { base: directory, pattern: 'first.html', negated: false }
    return { compiler, firstFile, secondFile, rule, request: { ...request, scanSources: [rule] } }
  }

  it('updates bare arbitrary units changed in place with the same candidates', async () => {
    const { compiler, request } = createCase()
    const bareArbitraryValues = { units: ['px'] }
    const generate = () => compiler.generate({ ...request, candidates: ['p-10px', 'p-10%'], bareArbitraryValues })
    const first = await generate()
    expect([...first.classSet]).toEqual(['p-10px'])

    bareArbitraryValues.units[0] = '%'
    const changed = await generate()
    expect([...changed.classSet]).toEqual(['p-10%'])
    expect(changed.css).toMatch(/padding:\s*10%/)
    expect(changed.css).not.toMatch(/padding:\s*10px/)
    expect(changed.cache).toEqual({ engine: true, output: false, source: true })

    const equivalent = await compiler.generate({
      ...request,
      candidates: ['p-10px', 'p-10%'],
      bareArbitraryValues: { units: ['%'] },
    })
    expect(equivalent.cache.output).toBe(true)
  })

  it('updates a source pattern changed in place and reuses equivalent rules', async () => {
    const { compiler, rule, request } = await createScanCase()
    const first = await compiler.generate(request)
    expect([...first.classSet]).toEqual(['w-[10px]'])

    rule.pattern = 'second.html'
    const changed = await compiler.generate(request)
    expect([...changed.classSet]).toEqual(['w-[20px]'])
    expect(changed.css).toMatch(/width:\s*20px/)
    expect(changed.css).not.toMatch(/width:\s*10px/)
    expect(changed.cache).toEqual({ engine: true, output: false, source: true })

    const equivalent = await compiler.generate(structuredClone(request))
    expect(equivalent.cache.output).toBe(true)
    expect(equivalent.sources).toEqual([rule])
  })

  it('updates source rule additions and removals on the same array', async () => {
    const { compiler, request, rule } = await createScanCase()
    expect([...(await compiler.generate(request)).classSet]).toEqual(['w-[10px]'])
    request.scanSources.push({ ...rule, pattern: 'second.html' })
    expect([...(await compiler.generate(request)).classSet].sort()).toEqual(['w-[10px]', 'w-[20px]'])
    request.scanSources.shift()
    expect([...(await compiler.generate(request)).classSet]).toEqual(['w-[20px]'])
  })

  it('keeps committed source patterns isolated from caller mutations', async () => {
    const { compiler, rule, request, firstFile, secondFile } = await createScanCase()
    const original = structuredClone(request)
    const first = await compiler.generate(request)
    rule.pattern = 'second.html'
    expect(compiler.invalidate([secondFile])).toEqual([])
    const reused = await compiler.generate(original)
    expect(reused.cache.output).toBe(true)
    expect(reused.sources).toEqual(first.sources)
    expect(compiler.invalidate([secondFile])).toEqual([])
    expect(compiler.invalidate([firstFile])).toEqual([request.id])
  })

  it.each([
    ['/repo/a', '/repo/b'],
    ['C:\\repo\\a', 'C:\\repo\\b'],
    ['C:\\', 'D:\\'],
    ['/', './'],
    ['./a', '../b'],
  ])('updates the scan base identity from %s to %s', async (base, nextBase) => {
    const { compiler, request } = createCase()
    const rule = { base, pattern: '*.html', negated: true }
    const scanSources = [rule]
    const first = await compiler.generate({ ...request, scanSources })
    rule.base = nextBase
    const changed = await compiler.generate({ ...request, scanSources })
    expect(changed.cache.output).toBe(false)
    expect(changed.sources).toEqual([{ base: nextBase, pattern: '*.html', negated: true }])
    expect(first.sources).toEqual([{ base, pattern: '*.html', negated: true }])
  })

  it('observes source content changed in place', async () => {
    const { compiler, request } = createCase()
    const sources = [{ content: '<view class="w-[10px]" />', extension: 'html' }]
    expect([...(await compiler.generate({ ...request, sources })).classSet]).toEqual(['w-[10px]'])
    sources[0]!.content = '<view class="w-[20px]" />'
    const changed = await compiler.generate({ ...request, sources })
    expect([...changed.classSet]).toEqual(['w-[20px]'])
    expect(changed.cache.output).toBe(false)
  })

  it('observes excludeFiles mutations in compiled scan mode', async () => {
    const { compiler, request, firstFile, secondFile, rule } = await createScanCase()
    rule.pattern = '*.html'
    const excludeFiles = [firstFile]
    const generate = () => compiler.generate({ ...request, excludeFiles, scanMode: 'compiled' })
    expect([...(await generate()).classSet]).toEqual(['w-[20px]'])
    excludeFiles[0] = secondFile
    const changed = await generate()
    expect([...changed.classSet]).toEqual(['w-[10px]'])
    expect(changed.cache.output).toBe(false)
  })

  it('observes scanMode transitions on the same request', async () => {
    const { compiler, request: base, firstFile } = await createScanCase()
    const request: CompilerGenerateRequest = { ...base, excludeFiles: [firstFile] }
    expect([...(await compiler.generate(request)).classSet]).toEqual(['w-[10px]'])
    request.scanMode = 'compiled'
    expect((await compiler.generate(request)).classSet.size).toBe(0)
    delete request.scanMode
    const legacy = await compiler.generate(request)
    expect([...legacy.classSet]).toEqual(['w-[10px]'])
    expect(legacy.cache.output).toBe(false)
  })
})
