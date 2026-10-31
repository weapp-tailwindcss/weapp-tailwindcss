import path from 'node:path'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { describe, expect, it, vi } from 'vitest'
import {
  createViteCssMemory,
  normalizeCssSourceIdentity,
  shouldCollectTransformedSourceCandidates,
} from '@/bundlers/vite/css-memory'
import { isWeappViteSidecarRequest, resolveViteCssPipelineRequestFile } from '@/bundlers/vite/utils'

describe('vite css memory', () => {
  it('normalizes css source identities and transform collection requests', () => {
    expect(normalizeCssSourceIdentity('/src/App.vue?vue&type=style&index=2&lang.css#hash')).toBe('/src/App.vue?type=style&index=2')
    expect(normalizeCssSourceIdentity('/src/app.css?used')).toBe('/src/app.css')
    expect(shouldCollectTransformedSourceCandidates('/src/App.vue?vue&type=style')).toBe(false)
    expect(shouldCollectTransformedSourceCandidates('/src/app.wxss?weapp-vite-sidecar-owner=app&weapp-vite-sidecar=style&lang.css')).toBe(false)
    expect(shouldCollectTransformedSourceCandidates('/src/app.ts?raw')).toBe(true)
    expect(shouldCollectTransformedSourceCandidates('/src/app.ts')).toBe(true)
  })

  it('keeps weapp-vite sidecar module ids out of physical css file paths', () => {
    const sidecarRequest = '/src/app.wxss?weapp-vite-sidecar-owner=app&weapp-vite-sidecar=style&lang.css'

    expect(isWeappViteSidecarRequest(sidecarRequest)).toBe(true)
    expect(resolveViteCssPipelineRequestFile(sidecarRequest)).toBe('/src/app.wxss')
    expect(isWeappViteSidecarRequest('/src/app.css?label=weapp-vite-sidecar=style')).toBe(false)
    expect(resolveViteCssPipelineRequestFile('/src/app.css?direct')).toBe('/src/app.css?direct')
  })

  it('remembers, refreshes, and prunes css sources', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'weapp-tw-css-memory-'))
    await mkdir(path.join(root, 'src'), { recursive: true })
    const cssFile = path.join(root, 'src/app.css')
    const vueFile = path.join(root, 'src/App.vue')
    await writeFile(cssFile, '.from-file-must-not-be-read{color:red}')
    await writeFile(vueFile, '<template></template><style>.a{color:red}</style><style>.b{color:blue}</style>')
    const debug = vi.fn()
    const candidateSources = new Map<string, string>()
    const memory = createViteCssMemory({
      debug,
      getSourceCandidateSource: file => candidateSources.get(file),
    })

    memory.rememberKnownSfcSource(vueFile, '<style>.cached{color:red}</style>')
    memory.rememberCssSource({
      outputFile: 'app.wxss',
      rawSource: '.old{color:black}',
      sourceFile: cssFile,
    }, 'sig-1')

    expect(memory.getRememberedCssSignature('app.wxss')).toBe('sig-1')
    expect(memory.getKnownSfcSource(vueFile)).toContain('.cached')

    candidateSources.set(cssFile, '.from-transform-cache{color:red}')
    await memory.refreshRememberedCssSourceByCurrentFile(cssFile)
    expect(memory.getRememberedCssSourceEntry('app.wxss')?.rawSource).toBe('.from-transform-cache{color:red}')
    expect(memory.getRememberedCssSignature('app.wxss')).toBeUndefined()

    memory.rememberCssSource({
      outputFile: 'page.wxss',
      rawSource: '.page-old{color:black}',
      sourceFile: `${vueFile}?vue&type=style&index=1&lang.css`,
    })
    candidateSources.set(vueFile, '<style>.first{}</style><style>.second{}</style>')
    await memory.refreshRememberedCssSourceByCurrentFile(vueFile)
    expect(memory.getRememberedCssSourceEntry('page.wxss')?.rawSource).toBe('.second{}')

    memory.setRememberedCssSignature('page.wxss', 'sig-2')
    expect(memory.getRememberedCssSignature('page.wxss')).toBe('sig-2')

    memory.prune({
      activeFiles: new Set(['page.wxss']),
      activeKnownSfcFiles: new Set([vueFile]),
    })
    expect(memory.getRememberedCssSourceEntry('app.wxss')).toBeUndefined()
    expect(memory.getRememberedCssSourceEntry('page.wxss')).toBeTruthy()
    expect(memory.getStats().rememberedCssSources).toBe(1)
  })

  it('does not read existing style files during lifecycle refresh', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'weapp-tw-css-memory-no-read-'))
    const cssFile = path.join(root, 'existing.css')
    await writeFile(cssFile, '.from-file{color:red}')
    const debug = vi.fn()
    const memory = createViteCssMemory({
      debug,
      getSourceCandidateSource: () => undefined,
    })
    const remembered = {
      outputFile: 'existing.acss',
      rawSource: '.remembered{color:blue}',
      sourceFile: cssFile,
    }
    memory.rememberCssSource(remembered)

    await memory.refreshRememberedCssSourceByCurrentFile(cssFile)
    expect(memory.getRememberedCssSourceEntry('existing.acss')?.rawSource).toBe('.remembered{color:blue}')
    expect(debug).toHaveBeenCalledWith(
      'refresh remembered css source skipped: missing cached source for %s',
      cssFile,
    )
  })

  it('refreshes remembered sfc entries with all style blocks and prunes stale known sfc files', async () => {
    const debug = vi.fn()
    const candidateSources = new Map<string, string>()
    const memory = createViteCssMemory({
      debug,
      getSourceCandidateSource: file => candidateSources.get(file),
    })
    const sfcFile = '/project/src/App.vue'
    const remembered = {
      outputFile: 'app.wxss',
      rawSource: '.old{}',
      sourceFile: sfcFile,
    }

    memory.rememberKnownSfcSource(`${sfcFile}?vue&type=script`, '<style>.ignored{}</style>')
    expect(memory.getKnownSfcSource(sfcFile)).toBeUndefined()

    memory.rememberCssSource(remembered, 'sig')
    candidateSources.set(sfcFile, '<template></template><style>.a{}</style><style>.b{}</style>')

    await memory.refreshRememberedCssSourceByCurrentFile(sfcFile)
    expect(memory.getRememberedCssSourceEntry('app.wxss')?.rawSource).toBe('.a{}\n.b{}')
    expect(memory.getRememberedCssSignature('app.wxss')).toBeUndefined()

    memory.rememberKnownSfcSource(sfcFile, '<style>.known{}</style>')
    candidateSources.clear()
    expect(memory.getKnownSfcSource(sfcFile)).toContain('.known')
    memory.prune({
      activeFiles: new Set(['app.wxss']),
      activeKnownSfcFiles: new Set(['/project/src/Other.vue']),
    })
    expect(memory.getKnownSfcSource(sfcFile)).toBeUndefined()
  })

  it('作者移除 style 后撤销对应索引的旧输入与签名', async () => {
    const sfcFile = '/project/Label.vue'
    let source = '<style>.first{@apply flex}</style><style>.deleted{@apply block}</style>'
    const memory = createViteCssMemory({ debug: vi.fn(), getSourceCandidateSource: () => source })
    memory.rememberCssSource({ outputFile: 'first.css', sourceFile: `${sfcFile}?vue&type=style&index=0`, rawSource: '.first{@apply flex}' })
    memory.rememberCssSource({ outputFile: 'removed.css', sourceFile: `${sfcFile}?vue&type=style&index=1`, rawSource: '.deleted{@apply block}' }, 'old-proof')
    source = '<style>.first{@apply flex}</style>'
    await memory.refreshRememberedCssSourceByCurrentFile(sfcFile)
    expect(memory.getRememberedCssSourceEntry('first.css')?.rawSource).toBe('.first{@apply flex}')
    expect(memory.getRememberedCssSourceEntry('removed.css')).toBeUndefined()
    expect(memory.getRememberedCssSignature('removed.css')).toBeUndefined()
    memory.dispose()
  })

  it('logs missing current file refresh sources and keeps unrelated requests untouched', async () => {
    const debug = vi.fn()
    const memory = createViteCssMemory({
      debug,
      getSourceCandidateSource: () => undefined,
    })

    memory.rememberCssSource({
      outputFile: 'page.wxss',
      rawSource: '.old{}',
      sourceFile: '/project/src/Page.vue?vue&type=style&index=3',
    })
    await memory.refreshRememberedCssSourceByCurrentFile('/project/src/Page.vue')

    expect(debug).toHaveBeenCalledWith(
      'refresh remembered css source skipped: missing cached source for %s',
      '/project/src/Page.vue',
    )

    memory.rememberCssSource({
      outputFile: 'script.wxss',
      rawSource: '.old{}',
      sourceFile: '/project/src/page.ts',
    })
    await memory.refreshRememberedCssSourceByCurrentFile('/project/src/page.ts')
    expect(memory.getRememberedCssSourceEntry('script.wxss')?.rawSource).toBe('.old{}')
  })
})
