import { parse } from '@vue/compiler-dom'
import { parse as parseSfc } from '@vue/compiler-sfc'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createViteCssMemory } from '@/bundlers/vite/css-memory'
import { createViteSfcStyleSnapshots } from '@/bundlers/vite/css-memory/sfc-snapshot'
import { resolveSfcStyleRequestFromBlocks } from '@/bundlers/vite/generate-bundle/sfc-style-source'

vi.mock('@vue/compiler-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@vue/compiler-dom')>()
  return { ...actual, parse: vi.fn(actual.parse) }
})

afterEach(() => vi.clearAllMocks())

const document = '<template><view /></template><style>.first{color:red}</style><style scoped>.second{color:blue}</style>'

describe('Vite SFC style snapshots', () => {
  it('shares immutable flat blocks across raw and prepared consumers of the same text', () => {
    const snapshots = createViteSfcStyleSnapshots(2)
    const raw = snapshots.resolve('Page.vue', document, 'raw')
    const prepared = snapshots.resolve('Page.vue', document, 'prepared')
    expect(prepared).toBe(raw)
    expect(snapshots.resolve('Page.vue', document, 'raw')).toBe(raw)
    expect(parse).toHaveBeenCalledOnce()
    expect(Object.keys(raw)).toEqual(['source', 'styles'])
    expect(Object.isFrozen(raw)).toBe(true)
    expect(Object.isFrozen(raw.styles)).toBe(true)
    expect(raw.styles.every(Object.isFrozen)).toBe(true)
    expect(raw.styles.map(style => style.source)).toEqual(['.first{color:red}', '.second{color:blue}'])
    expect(snapshots.getStats()).toEqual({ files: 1, snapshots: 1, sourceCharacters: document.length, styleCharacters: '.first{color:red}.second{color:blue}'.length })
  })

  it('uses exact text identity and independently retains only the current raw and prepared text', () => {
    const snapshots = createViteSfcStyleSnapshots(1)
    const raw = snapshots.resolve('Page.uvue', document, 'raw')
    const generated = `<style>.generated{}</style>${document}`
    const prepared = snapshots.resolve('Page.uvue', generated, 'prepared')
    expect(prepared.styles[1]?.source).toBe(raw.styles[0]?.source)
    expect(prepared.styles[1]?.index).toBe(1)
    expect(snapshots.resolve('Page.uvue', document, 'raw')).toBe(raw)
    expect(snapshots.resolve('Page.uvue', generated, 'prepared')).toBe(prepared)
    expect(parse).toHaveBeenCalledTimes(2)
    snapshots.resolve('Page.uvue', `${document}\r\n`, 'raw')
    snapshots.resolve('Page.uvue', `${document}\n`, 'raw')
    expect(parse).toHaveBeenCalledTimes(4)
  })

  it('evicts the least recently used file and clears both source kinds on prune, delete and clear', () => {
    const snapshots = createViteSfcStyleSnapshots(2)
    const a = snapshots.resolve('A.vue', document, 'raw')
    const b = snapshots.resolve('B.vue', document, 'raw')
    snapshots.resolve('A.vue', document, 'prepared')
    snapshots.resolve('C.vue', document, 'raw')
    expect(snapshots.resolve('A.vue', document, 'raw')).toBe(a)
    expect(snapshots.resolve('B.vue', document, 'prepared')).not.toBe(b)
    const currentB = snapshots.resolve('B.vue', document, 'raw')
    snapshots.prune(new Set(['B.vue']))
    expect(snapshots.resolve('B.vue', document, 'prepared')).toBe(currentB)
    expect(snapshots.resolve('A.vue', document, 'raw')).not.toBe(a)
    snapshots.delete('B.vue')
    expect(snapshots.resolve('B.vue', document, 'prepared')).not.toBe(currentB)
    const currentA = snapshots.resolve('A.vue', document, 'prepared')
    snapshots.clear()
    expect(snapshots.getStats()).toEqual({ files: 0, snapshots: 0, sourceCharacters: 0, styleCharacters: 0 })
    expect(snapshots.resolve('A.vue', document, 'raw')).not.toBe(currentA)
  })

  it('keeps native descriptor indices for empty, scoped, preprocessed and external style blocks', () => {
    const source = '<template><view /></template>\r\n<style />\r\n<style> </style><style src=""/><style data-note=">" scoped lang="scss">.real { color: red; }</style><style src="./external.css"></style>'
    const actual = createViteSfcStyleSnapshots(1).resolve('Page.vue', source, 'raw').styles
    const expected = parseSfc(source).descriptor.styles
    expect(actual.map(style => ({ index: style.index, source: style.source, scoped: style.scoped, src: style.src, lang: style.lang })))
      .toEqual(expected.map((style, index) => ({ index, source: style.content, scoped: Boolean(style.scoped), src: style.src, lang: style.lang })))
    expect(new URLSearchParams(resolveSfcStyleRequestFromBlocks('Page.vue', actual, '.compiled{}', 'Page.vue?vue&type=style&index=1').split('?')[1]).get('scoped')).toBe('true')
  })
})

describe('Vite CSS memory snapshot lifecycle', () => {
  it.each([
    '/project/Label.vue',
    'C:\\project\\Label.vue',
    '\\\\server\\share\\Label.vue',
    'fixtures/Label.vue',
  ])('reuses main-document parsing across style requests for %s', (file) => {
    const memory = createViteCssMemory({ debug() {}, getSourceCandidateSource() {} })
    memory.rememberKnownSfcSource(file, document)
    const first = memory.getKnownSfcStyleSnapshot(file)
    for (const request of [file, `${file}?vue&type=style&index=0`, `${file}?vue&type=style&index=1&scoped=true`]) {
      expect(memory.getKnownSfcStyleSnapshot(request)).toBe(first)
    }
    memory.rememberKnownSfcSource(`${file}?vue&type=script`, '<style>.subrequest{}</style>')
    memory.rememberKnownSfcSource(file, document)
    expect(memory.getKnownSfcStyleSnapshot(file)).toBe(first)
    expect(parse).toHaveBeenCalledOnce()
    memory.dispose()
  })

  it('gives the current scan priority including empty styles, then follows replacement and restoration', () => {
    let scan: string | undefined
    const file = '/project/Label.vue'
    const memory = createViteCssMemory({ debug() {}, getSourceCandidateSource: () => scan })
    memory.rememberKnownSfcSource(file, document)
    const initial = memory.getKnownSfcStyleSnapshot(file)
    scan = '<template><view /></template><style> </style>'
    const empty = memory.getKnownSfcStyleSnapshot(file)
    expect(empty?.source).toBe(scan)
    expect(empty?.styles).toEqual([])
    expect(memory.getKnownSfcStyleSnapshot(file)).toBe(empty)
    scan = '<template><view /></template><style>.replacement{}</style>'
    expect(memory.getKnownSfcStyleSnapshot(file)?.styles[0]?.source).toBe('.replacement{}')
    scan = document
    expect(memory.getKnownSfcStyleSnapshot(file)?.styles).toEqual(initial?.styles)
    scan = ''
    expect(memory.getKnownSfcStyleSnapshot(file)?.source).toBe('')
    expect(memory.getKnownSfcStyleSnapshot(file)?.styles).toEqual([])
    scan = undefined
    expect(memory.getKnownSfcStyleSnapshot(file)).toBe(initial)
    memory.dispose()
  })

  it('shares normalized snapshots while preserving separate authored and generated indices', () => {
    const file = '/project/Label.uvue'
    const normalized = `<style>.generated{}</style>${document}`
    const memory = createViteCssMemory({ debug() {}, getSourceCandidateSource: () => document, normalizeSfcSource: () => normalized })
    memory.rememberCssSource({ outputFile: 'author.css', sourceFile: `${file}?vue&type=style&index=1`, rawSource: '.old{}' })
    memory.rememberKnownSfcSource(file, document)
    const snapshot = memory.getKnownSfcStyleSnapshot(file)
    expect(snapshot?.source).toBe(normalized)
    expect(snapshot?.styles[0]?.source).toBe('.generated{}')
    expect(snapshot?.styles[1]?.source).toBe('.first{color:red}')
    expect(memory.getRememberedCssSourceEntry('author.css')?.rawSource).toBe('.first{color:red}')
    expect(memory.getKnownSfcStyleSnapshot(file)).toBe(snapshot)
    expect(parse).toHaveBeenCalledTimes(2)
    memory.dispose()
  })

  it('revokes snapshots and leases on remove, prunes known files, and rejects all sources after dispose', () => {
    const file = '/project/Label.vue'
    let scan: string | undefined = document
    const memory = createViteCssMemory({ debug() {}, getSourceCandidateSource: () => scan })
    memory.rememberKnownSfcSource(file, document)
    const initial = memory.getKnownSfcStyleSnapshot(file)
    const lease = memory.captureSource(`${file}?vue&type=style&index=0`)
    memory.removeSource(file)
    expect(lease()).toBe(false)
    expect(memory.getKnownSfcStyleSnapshot(file)).toBeUndefined()
    memory.rememberKnownSfcSource(file, document)
    expect(memory.getKnownSfcStyleSnapshot(file)).toBeUndefined()
    memory.restoreSource(file)
    const restored = memory.getKnownSfcStyleSnapshot(file)
    expect(restored).not.toBe(initial)
    memory.rememberKnownSfcSource(file, document)
    memory.prune({ activeFiles: new Set(), activeKnownSfcFiles: new Set() })
    expect(memory.getKnownSfcStyleSnapshot(file)).not.toBe(restored)
    scan = undefined
    expect(memory.getKnownSfcStyleSnapshot(file)).toBeUndefined()
    memory.dispose()
    scan = document
    expect(memory.getKnownSfcStyleSnapshot(file)).toBeUndefined()
    expect(memory.getStats().sfcStyleSnapshots.files).toBe(0)
    lease.release()
  })

  it('bounds scan-only snapshot retention to the existing 128-file capacity', () => {
    const memory = createViteCssMemory({ debug() {}, getSourceCandidateSource: () => document })
    const initial = memory.getKnownSfcStyleSnapshot('/project/File0.vue')
    for (let index = 1; index <= 128; index++) memory.getKnownSfcStyleSnapshot(`/project/File${index}.vue`)
    expect(memory.getStats().sfcStyleSnapshots.files).toBe(128)
    expect(memory.getKnownSfcStyleSnapshot('/project/File0.vue')).not.toBe(initial)
    expect(memory.getStats().sfcStyleSnapshots.files).toBe(128)
    memory.dispose()
  })
})
