import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.doUnmock('node:path')
  vi.resetModules()
})

describe.each([
  { name: 'POSIX', api: path.posix, root: '/project', other: '/other', relative: 'src/card.html' },
  { name: 'Windows', api: path.win32, root: 'C:\\project', other: 'D:\\other', relative: 'src\\card.html' },
])('$name source paths', ({ api, root, other, relative }) => {
  it('keeps filesystem roots and relative paths separate from glob patterns', async () => {
    vi.doMock('node:path', () => ({ default: api }))
    const scan = await import('../src/v4/source-scan')
    const { toRelativeFile } = await import('../src/extraction/project-report')
    const file = api.resolve(root, relative)
    expect(toRelativeFile(root, file)).toBe('src/card.html')
    const entries = [{ base: root, pattern: '**/*.html', negated: false }]
    expect(scan.resolveSourceScanPath(root)).toBe(api.resolve(root))
    expect(scan.isFileMatchedByTailwindV4SourceEntries(file, entries)).toBe(true)
    expect(scan.isFileMatchedByTailwindV4SourceEntries(api.join(other, 'card.html'), entries)).toBe(false)
    expect(scan.toPosixPath(api.relative(root, file))).toBe('src/card.html')
    expect(await scan.resolveTailwindV4SourceEntry(api.join(root, 'src', '*.html'), root, false))
      .toEqual({ base: api.join(root, 'src'), pattern: '*.html', negated: false })
    expect(await scan.resolveTailwindV4SourceEntry('./src/**/*.html', root, true))
      .toEqual({ base: api.join(root, 'src'), pattern: '**/*.html', negated: true })
    expect(scan.isFileMatchedByTailwindV4SourceEntries(file, [
      ...entries,
      { base: root, pattern: 'src/**', negated: true },
    ])).toBe(false)
    const filesystemRoot = api.parse(root).root
    expect(scan.isFileMatchedByTailwindV4SourceEntries(api.join(filesystemRoot, 'card.html'), [
      { base: filesystemRoot, pattern: '*.html', negated: false },
    ])).toBe(true)
  })

  it('normalizes cache identities with the selected filesystem semantics', async () => {
    vi.doMock('node:path', () => ({ default: api }))
    const { getTailwindV4DesignSystemCacheKey } = await import('../src/v4/node-adapter')
    const source = { css: '@theme { --color-brand: red; }', base: root, baseFallbacks: [] }
    expect(getTailwindV4DesignSystemCacheKey(source)).toBe(getTailwindV4DesignSystemCacheKey({
      ...source,
      base: api.join(root, 'src', '..'),
    }))
    expect(getTailwindV4DesignSystemCacheKey(source)).not.toBe(getTailwindV4DesignSystemCacheKey({
      ...source,
      base: other,
    }))
  })
})
