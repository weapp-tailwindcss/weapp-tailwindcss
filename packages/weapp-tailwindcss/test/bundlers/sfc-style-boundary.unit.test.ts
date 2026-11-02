import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { parse } from '@vue/compiler-sfc'
import { describe, expect, it } from 'vitest'
import { createViteCssMemory } from '@/bundlers/vite/css-memory'
import { extractSfcStyleBlocks, resolveSfcStyleRequestFromKnownSource } from '@/bundlers/vite/generate-bundle/sfc-style-source'
import { resolveSourceSideCssEntrySource } from '@/generation/source-files'
import { resolveUniAppXStyleSource } from '@/uni-app-x/vite/style-source'

describe('SFC top-level style boundaries', () => {
  it.each(['.vue', '.uvue', '.nvue', '.mpx'])('ignores script, custom blocks and comments in %s', (extension) => {
    const source = `<!-- <style>.comment{}</style> -->
<script setup>const fake = '<style scoped>.script{}</style>'</script>
<json>{"example":"<style>.json{}</style>"}</json>
<template><template v-if="ok"><view /></template></template>
<style data-example=">" scoped lang="scss">\r\n.author { color: blue; }\r\n</style>
<style src="./external.scss" />
<style></style>`
    const { descriptor } = parse(source, { filename: `Probe${extension}` })
    const actual = extractSfcStyleBlocks(source, `Probe${extension}`)
    const expected = descriptor.styles.map(style => style.content)
    expect(actual.map(style => style.source)).toEqual(expected)
    expect(actual.map(style => style.index)).toEqual([0, 1])
    expect(actual[0]).toMatchObject({ scoped: true, source: '\r\n.author { color: blue; }\r\n' })
    expect(actual[0]!.attrs).toContain('data-example=">"')
  })

  it.each(['', '   ', '\r\n', '/** author */'])('matches native descriptor indices around an empty author style: %j', (content) => {
    const source = `<style>.preflight{border-width:0}</style><style>${content}</style><style src=""/><style>.author{color:blue}</style><style>.generated{height:32px}</style>`
    const expected = parse(source).descriptor.styles.map(style => style.content)
    const actual = extractSfcStyleBlocks(source, 'Probe.uvue')
    expect(actual.map(style => style.source)).toEqual(expected)
    expect(actual.map(style => style.index)).toEqual(expected.map((_, index) => index))
  })

  it('retains the independent Svelte adapter for nested markup', () => {
    expect(extractSfcStyleBlocks('<div><div>inner</div><span>after</span></div><style>.real{}</style>', 'Probe.svelte'))
      .toEqual([{ attrs: '', index: 0, scoped: false, source: '.real{}' }])
  })

  it('retains the preprocessor language in Svelte style requests', () => {
    const style = '.real { @apply text-red-500; }'
    const request = resolveSfcStyleRequestFromKnownSource('Probe.svelte', `<div>content</div><style lang="scss">${style}</style>`, style)
    expect(new URLSearchParams(request.split('?')[1]).get('lang')).toBe('scss')
  })

  it('refreshes a remembered style by its real index', async () => {
    const file = '/project/Probe.uvue'
    const memory = createViteCssMemory({ debug: () => {}, getSourceCandidateSource: () => undefined })
    memory.rememberCssSource({ outputFile: 'probe.css', sourceFile: `${file}?vue&type=style&index=0`, rawSource: '.old{}' })
    memory.rememberKnownSfcSource(file, `<script>const example = '<style>.fake{}</style>'</script><style>.real{}</style>`)
    expect([...memory.getRememberedCssSources().values()][0]?.rawSource).toBe('.real{}')
  })

  it.each([
    `<script>const example = '<style>@import "tailwindcss";</style>'</script>`,
    `<script>/* @import "tailwindcss"; */</script><template><view /></template>`,
    `<script>const example = '<style>@import "tailwindcss";</style>'</script><style>.real{}</style>`,
  ])('does not scan fake directives or the entire style-less SFC', (sourceCss) => {
    const directory = mkdtempSync(path.join(os.tmpdir(), 'sfc-boundary-'))
    try {
      const sourceFile = path.join(directory, 'Probe.uvue')
      writeFileSync(sourceFile, sourceCss)
      expect(resolveSourceSideCssEntrySource(path.join(directory, 'output.css'), { sourceFile })).toBeUndefined()
    }
    finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('keeps explicit CSS overrides with an SFC source identity', () => {
    expect(resolveSourceSideCssEntrySource('/project/output.css', {
      sourceFile: '/project/Probe.uvue',
      sourceCss: '@import "tailwindcss";',
    })?.css).toContain('@import "tailwindcss";')
  })

  it('does not restore a deleted last style from an older document', async () => {
    const file = '/project/Probe.uvue'
    let current: string | undefined
    const memory = createViteCssMemory({ debug: () => {}, getSourceCandidateSource: () => current })
    memory.rememberKnownSfcSource(file, '<style>.old{}</style>')
    memory.rememberCssSource({ outputFile: 'probe.css', sourceFile: `${file}?vue&type=style&index=0`, rawSource: '.old{}' })
    current = '<template><view /></template>'
    await memory.refreshRememberedCssSourceByCurrentFile(file)
    expect(memory.getRememberedCssSources().size).toBe(0)
  })

  it('preserves raw CSS with style-like string content', () => {
    const code = `.example::after { content: '<style>.fake{}</style>'; }`
    expect(resolveUniAppXStyleSource(code, { vue: true, type: 'style', index: 0 } as any, '.author{}')).toEqual({ code })
  })

  it.each([
    '<script>const text = "<style>@apply h-8;</style>"</script><template><view /></template>',
    '<!-- <style>@apply h-8;</style> --><template><view /></template>',
    '<template><view /></template><style></style>',
    '<template><view /></template><style> \r\n </style>',
  ])('does not pass a style-less full SFC to CSS processing: %s', (code) => {
    const query = { vue: true, type: 'style', index: 0 } as any
    expect(resolveUniAppXStyleSource(code, query)).toEqual({ skip: true })
    expect(resolveUniAppXStyleSource(code, query, '.generated{}')).toEqual({ code: '.generated{}' })
    expect(resolveUniAppXStyleSource(code, query, '')).toEqual({ code: '' })
  })
})
