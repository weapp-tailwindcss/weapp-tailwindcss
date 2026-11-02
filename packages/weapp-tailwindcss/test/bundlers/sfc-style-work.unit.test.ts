import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { parse } from '@vue/compiler-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createViteCssMemory } from '@/bundlers/vite/css-memory'
import { resolveSourceSideCssEntrySource } from '@/generation/source-files'
import { extractSfcStyleBlocks } from '@/utils/sfc'

vi.mock('@vue/compiler-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@vue/compiler-dom')>()
  return { ...actual, parse: vi.fn(actual.parse) }
})

afterEach(() => vi.clearAllMocks())

describe('SFC style parsing work', () => {
  it.each([
    '<template><view /></template><script setup>const value = 1</script>',
    'export default function render() { return "compiled module" }',
  ])('does not build an SFC tree when no style tag can exist: %s', (source) => {
    expect(extractSfcStyleBlocks(source, 'Probe.mpx')).toEqual([])
    expect(parse).not.toHaveBeenCalled()
  })

  it('still parses possible style tags to reject script and comment content', () => {
    const source = '<!-- <style>.fake{}</style> --><script>const fake = "<style>.fake{}</style>"</script>'
    expect(extractSfcStyleBlocks(source, 'Probe.vue')).toEqual([])
    expect(parse).toHaveBeenCalledOnce()
  })

  it('preserves case-insensitive style tags in the independent Svelte adapter', () => {
    expect(extractSfcStyleBlocks('<div>content</div><STYLE>.real{}</STYLE>', 'Probe.svelte')[0]?.source).toBe('.real{}')
    expect(parse).not.toHaveBeenCalled()
  })

  it('parses a main document once while refreshing every remembered style index', () => {
    const file = path.resolve('Probe.vue')
    const memory = createViteCssMemory({ debug() {}, getSourceCandidateSource() {} })
    for (let index = 0; index < 4; index++) {
      memory.rememberCssSource({ outputFile: `probe${index}.css`, sourceFile: `${file}?vue&type=style&index=${index}`, rawSource: '.old{}' })
    }
    memory.rememberCssSource({ outputFile: 'joined.css', sourceFile: file, rawSource: '.old{}' })

    memory.rememberKnownSfcSource(file, '<template><view /></template><style>.first{}</style><style scoped>.second{}</style><style src="./external.css"/>')

    expect(parse).toHaveBeenCalledOnce()
    expect(memory.getRememberedCssSourceEntry('probe0.css')?.rawSource).toBe('.first{}')
    expect(memory.getRememberedCssSourceEntry('probe1.css')?.rawSource).toBe('.second{}')
    expect(memory.getRememberedCssSourceEntry('probe2.css')?.rawSource).toBe('')
    expect(memory.getRememberedCssSourceEntry('probe3.css')).toBeUndefined()
    expect(memory.getRememberedCssSourceEntry('joined.css')?.rawSource).toBe('.first{}\n.second{}\n')
  })

  it('keeps separate raw and normalized snapshots when generated styles shift indices', () => {
    const file = path.resolve('Probe.uvue')
    const memory = createViteCssMemory({
      debug() {},
      getSourceCandidateSource() {},
      normalizeSfcSource: source => `<style>.generated{}</style>${source}`,
    })
    for (let index = 0; index < 3; index++) {
      memory.rememberCssSource({ outputFile: `probe${index}.css`, sourceFile: `${file}?vue&type=style&index=${index}`, rawSource: '.old{}' })
    }
    memory.rememberKnownSfcSource(file, '<template><view /></template><style scoped>.author{}</style>')

    expect(parse).toHaveBeenCalledTimes(2)
    expect(memory.getRememberedCssSourceEntry('probe0.css')?.rawSource).toBe('.generated{}')
    expect(memory.getRememberedCssSourceEntry('probe1.css')?.rawSource).toBe('.author{}')
    expect(memory.getRememberedCssSourceEntry('probe2.css')).toBeUndefined()
    expect(memory.getKnownSfcSource(file)).toBe('<style>.generated{}</style><template><view /></template><style scoped>.author{}</style>')
  })

  it('reuses the same style snapshot for directives and local import discovery', () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), 'sfc-style-work-'))
    try {
      const file = path.join(directory, 'Probe.mpx')
      writeFileSync(file, '<template><view /></template><style>@import "./base.css";</style><style>.author{color:red}</style>')
      writeFileSync(path.join(directory, 'base.css'), '@import "tailwindcss";')

      const entry = resolveSourceSideCssEntrySource(path.join(directory, 'output.css'), { sourceFile: file })

      expect(entry?.css).toContain('@import "tailwindcss";')
      expect(parse).toHaveBeenCalledOnce()
    }
    finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })
})
