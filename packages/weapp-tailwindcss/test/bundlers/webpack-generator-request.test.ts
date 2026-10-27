import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { createWebpackGeneratorRequestOptions } from '@/bundlers/webpack/BaseUnifiedPlugin/v5-assets/generator-request'

describe('webpack generator request assembly', () => {
  it('scopes entry selection without changing canonical configuration or source metadata', () => {
    const first = path.resolve('test-fixtures', 'first.css')
    const second = path.resolve('test-fixtures', 'second.css')
    const options = {
      cssEntries: [first, second],
      tailwindcss: { v4: { cssEntries: [first, second] } },
    }
    const handlerOptions = {
      isMainChunk: true,
      sourceOptions: { sourceFile: second, sourceCss: '@import "tailwindcss";' },
    }
    const originalOptions = structuredClone(options)
    const originalHandlerOptions = structuredClone(handlerOptions)

    const request = createWebpackGeneratorRequestOptions(options, handlerOptions, second)

    expect(request.opts).toBe(options)
    expect(request.cssHandlerOptions.sourceOptions?.cssEntries).toEqual([second])
    expect(request.cssHandlerOptions.sourceOptions?.sourceFile).toBe(second)
    expect(request.cssHandlerOptions.isMainChunk).toBe(true)
    expect(options).toEqual(originalOptions)
    expect(handlerOptions).toEqual(originalHandlerOptions)
  })

  it('prefers matching top-level entries and falls back to matching runtime entries', () => {
    const first = path.resolve('test-fixtures', 'first.css')
    const second = path.resolve('test-fixtures', 'second.css')
    const relativeFirst = path.relative(process.cwd(), first)
    const options = {
      cssEntries: [relativeFirst],
      tailwindcss: { v4: { cssEntries: [first, second] } },
    }

    expect(createWebpackGeneratorRequestOptions(options, {}, first)
      .cssHandlerOptions.sourceOptions?.cssEntries).toEqual([relativeFirst])
    expect(createWebpackGeneratorRequestOptions(options, {}, second)
      .cssHandlerOptions.sourceOptions?.cssEntries).toEqual([second])
    expect(createWebpackGeneratorRequestOptions({ tailwindcss: options.tailwindcss }, {}, second)
      .cssHandlerOptions.sourceOptions?.cssEntries).toEqual([second])
  })

  it.each([{ cssEntries: [] }, { cssEntries: ['explicit.css'] }])(
    'preserves explicit request entry selection $cssEntries',
    ({ cssEntries }) => {
      const options = { cssEntries: [path.resolve('configured.css')] }
      const handlerOptions = { sourceOptions: { cssEntries } }
      const request = createWebpackGeneratorRequestOptions(options, handlerOptions, 'unknown.css', {
        disableUnmatchedCssEntries: true,
      })

      expect(request.opts).toBe(options)
      expect(request.cssHandlerOptions.sourceOptions?.cssEntries).toEqual(cssEntries)
      expect(request.cssHandlerOptions.sourceOptions?.cssEntries).not.toBe(cssEntries)
      expect(handlerOptions.sourceOptions.cssEntries).toBe(cssEntries)
    },
  )

  it.each([undefined, 'unknown.css'])('keeps the fallback for unmatched source %s', (sourceFile) => {
    const options = { cssEntries: [path.resolve('configured.css')] }
    const handlerOptions = { isMainChunk: false }
    const request = createWebpackGeneratorRequestOptions(options, handlerOptions, sourceFile)

    expect(request.opts).toBe(options)
    expect(request.cssHandlerOptions).toBe(handlerOptions)
    expect(request.cssHandlerOptions.sourceOptions?.cssEntries).toBeUndefined()
  })

  it.each([undefined, 'unknown.css'])('disables configured fallback for unmatched main source %s', (sourceFile) => {
    const cssEntries = [path.resolve('configured.css')]
    const options = { cssEntries, tailwindcss: { v4: { cssEntries } } }
    const handlerOptions = { isMainChunk: true }
    const request = createWebpackGeneratorRequestOptions(options, handlerOptions, sourceFile, {
      disableUnmatchedCssEntries: true,
    })

    expect(request.opts).toBe(options)
    expect(request.cssHandlerOptions.sourceOptions?.cssEntries).toEqual([])
    expect(options.cssEntries).toEqual(cssEntries)
    expect(options.tailwindcss.v4.cssEntries).toEqual(cssEntries)
    expect(handlerOptions).toEqual({ isMainChunk: true })
  })

  it('does not introduce entry selection when no entries are configured', () => {
    const handlerOptions = {}
    expect(createWebpackGeneratorRequestOptions({}, handlerOptions, undefined, {
      disableUnmatchedCssEntries: true,
    }).cssHandlerOptions).toBe(handlerOptions)
  })

  it('normalizes owned CSS sources without changing their input array', () => {
    const emptySource = { css: '', file: 'empty.css', base: '.', dependencies: [] }
    const source = { css: '@import "tailwindcss";', file: 'entry.css', base: '.', dependencies: [] }
    const cssSources = [emptySource, source]
    const handlerOptions = { sourceOptions: { cssSources } }
    const request = createWebpackGeneratorRequestOptions({}, handlerOptions, source.file)

    expect(request.cssSources).toEqual([source])
    expect(request.cssHandlerOptions.sourceOptions?.cssSources).toEqual([source])
    expect(handlerOptions.sourceOptions?.cssSources).toBe(cssSources)
    expect(cssSources).toEqual([emptySource, source])
  })

  it('preserves an empty owned-source declaration without promoting it to generator sources', () => {
    const handlerOptions = { sourceOptions: { cssSources: [] } }
    const request = createWebpackGeneratorRequestOptions({}, handlerOptions, undefined)

    expect(request.cssSources).toBeUndefined()
    expect(request.cssHandlerOptions).toBe(handlerOptions)
  })

  it.each([
    ['POSIX absolute', '/workspace/styles/entry.css', '/workspace/styles/nested/../entry.css'],
    ['POSIX root', '/entry.css', '/nested/../entry.css'],
    ['Windows drive', 'C:\\workspace\\styles\\entry.css', 'C:/workspace/styles/nested/../entry.css'],
    ['Windows root', 'C:\\entry.css', 'C:/nested/../entry.css'],
    ['Windows UNC', '\\\\server\\share\\styles\\entry.css', '\\\\server\\share\\styles\\nested\\..\\entry.css'],
    ['Windows relative', 'styles\\entry.css', '.\\styles\\nested\\..\\entry.css'],
    ['native relative', path.join('styles', 'entry.css'), path.resolve('styles', 'entry.css')],
  ] as const)('matches %s source paths', (_label, entry, sourceFile) => {
    const request = createWebpackGeneratorRequestOptions({ cssEntries: [entry] }, {}, sourceFile)
    expect(request.cssHandlerOptions.sourceOptions?.cssEntries).toEqual([entry])
  })

  it('keeps different Windows drives in separate source scopes', () => {
    const handlerOptions = {}
    const request = createWebpackGeneratorRequestOptions({ cssEntries: ['C:\\entry.css'] }, handlerOptions, 'D:\\entry.css')
    expect(request.cssHandlerOptions).toBe(handlerOptions)
  })
})
