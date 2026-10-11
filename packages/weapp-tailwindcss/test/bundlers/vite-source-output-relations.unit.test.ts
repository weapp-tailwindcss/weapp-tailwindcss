import type { OutputAsset, OutputChunk } from 'rollup'
import { describe, expect, it } from 'vitest'
import { normalizeOutputPathKey } from '@/bundlers/shared/module-graph'
import { createViteCssMemory } from '@/bundlers/vite/css-memory'
import { collectRememberedCssReplayGroups } from '@/bundlers/vite/generate-bundle/remembered-css'
import { resolveCurrentSourceCandidateFile } from '@/bundlers/vite/generate-bundle/source-candidate-source'
import {
  createViteSourceOutputRelationOwner,
  withViteSourceOutputRelationOwner,
} from '@/bundlers/vite/source-output-relations'

function createAsset(fileName: string, originalFileNames: string[]): OutputAsset {
  return {
    type: 'asset',
    fileName,
    name: undefined,
    names: [],
    needsCodeReference: false,
    originalFileName: originalFileNames[0] ?? null,
    originalFileNames,
    source: '',
  }
}

function createChunk(fileName: string, facadeModuleId: string | null, moduleIds: string[]): OutputChunk {
  return {
    type: 'chunk',
    code: '',
    dynamicImports: [],
    exports: [],
    facadeModuleId,
    fileName,
    implicitlyLoadedBefore: [],
    importedBindings: {},
    imports: [],
    isDynamicEntry: false,
    isEntry: true,
    isImplicitEntry: false,
    map: null,
    moduleIds,
    modules: {},
    name: fileName,
    preliminaryFileName: fileName,
    referencedFiles: [],
    sourcemapFileName: null,
  }
}

describe('vite source output relations', () => {
  it.each([
    ['/workspace', 'index.html', '/workspace/index.html'],
    ['/', 'entry.html', '/entry.html'],
    ['C:\\workspace', 'views\\entry.html', 'C:\\workspace\\views\\entry.html'],
    ['D:\\workspace', 'views/entry.html', 'D:\\workspace\\views\\entry.html'],
    ['C:\\workspace', 'D:\\other\\entry.html', 'D:\\other\\entry.html'],
  ])('合并 CSS 的相对来源与生命周期绝对来源共享归属：%s + %s', (root, metadataSource, sourceFile) => {
    const owner = createViteSourceOutputRelationOwner()
    owner.recordOwnedOutput(sourceFile, 'assets/entry-old.css')
    owner.recordBundle({
      'assets/entry-new.css': createAsset('assets/entry-new.css', [metadataSource]),
    }, root)
    expect(owner.getOwnedOutputs(sourceFile)).toContain('assets/entry-new.css')
    expect(owner.getOutputSources('assets/entry-new.css')).toEqual(new Set([normalizeOutputPathKey(sourceFile)]))
    const groups = withViteSourceOutputRelationOwner(owner, () => collectRememberedCssReplayGroups(
      new Map([['previous', { outputFile: 'assets/entry-old.css', sourceFile, rawSource: '.probe{color:red}' }]]),
      { cssMatcher: file => file.endsWith('.css') },
      root,
      true,
      false,
      undefined,
      '.css',
      ['assets/entry-new.css'],
    ))
    expect([...groups.keys()]).toEqual(['assets/entry-new.css'])
  })

  it('consumes an explicitly deleted non-WeChat style output once', () => {
    const owner = createViteSourceOutputRelationOwner()
    const consumer = owner.createRemovalConsumer()
    owner.recordBundle({
      'styles/theme.acss': createAsset('styles/theme.acss', ['/workspace/src/theme.css']),
    })

    expect(owner.removeSource('/workspace/src/theme.css')).toEqual(new Set(['styles/theme.acss']))
    expect(consumer.consume([])).toEqual(['styles/theme.acss'])
    expect(consumer.consume([])).toEqual([])
  })

  it('keeps unrelated omitted outputs and filters outputs still emitted by the current bundle', () => {
    const owner = createViteSourceOutputRelationOwner()
    const consumer = owner.createRemovalConsumer()
    owner.recordBundle({
      'pages/a.ttss': createAsset('pages/a.ttss', ['/workspace/src/a.css']),
      'pages/b.ttss': createAsset('pages/b.ttss', ['/workspace/src/b.css']),
    })

    expect(consumer.consume(['pages/a.ttss'])).toEqual([])
    owner.removeSource('/workspace/src/a.css')
    expect(consumer.consume(['pages/a.ttss'])).toEqual([])
    owner.removeSource('/workspace/src/b.css')
    expect(consumer.consume([])).toEqual(['pages/b.ttss'])
  })

  it('does not remove a shared output until its final owner is deleted', () => {
    const owner = createViteSourceOutputRelationOwner()
    const consumer = owner.createRemovalConsumer()
    owner.recordOwnedOutput('/workspace/src/a.css', 'styles/shared.css')
    owner.recordOwnedOutput('/workspace/src/b.css', 'styles/shared.css')

    expect(owner.removeSource('/workspace/src/a.css')).toEqual(new Set())
    expect(consumer.consume([])).toEqual([])
    expect(owner.removeSource('/workspace/src/b.css')).toEqual(new Set(['styles/shared.css']))
    expect(consumer.consume([])).toEqual(['styles/shared.css'])
  })

  it('records lifecycle css snapshots as explicit source output ownership', () => {
    const owner = createViteSourceOutputRelationOwner()
    const cssMemory = createViteCssMemory({
      debug: () => undefined,
      getSourceCandidateSource: () => undefined,
    })
    withViteSourceOutputRelationOwner(owner, () => {
      cssMemory.rememberCssSource({
        outputFile: 'styles/theme.acss',
        rawSource: '@import "tailwindcss";',
        sourceFile: '/workspace/src/theme.css',
      })
    })

    const outputs = owner.getOwnedOutputs('/workspace/src/theme.css')
    const sources = owner.getOutputSources('styles/theme.acss')
    outputs.clear()
    sources.clear()

    expect(owner.getOwnedOutputs('/workspace/src/theme.css')).toEqual(new Set(['styles/theme.acss']))
    expect(owner.getOutputSources('styles/theme.acss')).toEqual(new Set(['/workspace/src/theme.css']))
  })

  it('normalizes SFC queries and blocks stale replay until the source is observed again', () => {
    const owner = createViteSourceOutputRelationOwner()
    const consumer = owner.createRemovalConsumer()
    owner.recordOwnedOutput('/workspace/src/Page.vue?vue&type=style&index=0', 'pages/page.acss')

    owner.removeSource('/workspace/src/Page.vue')
    owner.recordOwnedOutput('/workspace/src/Page.vue?vue&type=style&index=0', 'pages/page.acss')
    expect(consumer.consume([])).toEqual(['pages/page.acss'])

    owner.observeSource('/workspace/src/Page.vue')
    owner.recordOwnedOutput('/workspace/src/Page.vue?vue&type=style&index=0', 'pages/page.acss')
    expect(owner.removeSource('/workspace/src/Page.vue')).toEqual(new Set(['pages/page.acss']))
  })

  it('uses facade ownership and avoids treating multi-module chunk membership as ownership', () => {
    const owner = createViteSourceOutputRelationOwner()
    const consumer = owner.createRemovalConsumer()
    owner.recordBundle({
      'entry.js': createChunk('entry.js', '/workspace/src/entry.ts', [
        '/workspace/src/entry.ts',
        '/workspace/src/shared.ts',
      ]),
      'shared.js': createChunk('shared.js', null, [
        '/workspace/src/a.ts',
        '/workspace/src/b.ts',
      ]),
    })

    expect(owner.removeSource('/workspace/src/shared.ts')).toEqual(new Set())
    expect(owner.removeSource('/workspace/src/a.ts')).toEqual(new Set())
    expect(owner.removeSource('/workspace/src/entry.ts')).toEqual(new Set(['entry.js']))
    expect(consumer.consume([])).toEqual(['entry.js'])
  })

  it('records exact source-candidate matches but rejects suffix-only ownership', () => {
    const owner = createViteSourceOutputRelationOwner()
    const consumer = owner.createRemovalConsumer()
    const exactSource = '/workspace/source/views/card.axml'
    const suffixSource = '/workspace/other/views/fallback.axml'

    withViteSourceOutputRelationOwner(owner, () => {
      expect(resolveCurrentSourceCandidateFile({
        file: 'views/card.axml',
        getSourceCandidateSource: file => file === exactSource ? '<view />' : undefined,
        outDir: '/workspace/dist',
        rootDir: '/workspace',
        sourceRoot: '/workspace/source',
      })).toBe(exactSource)
      expect(resolveCurrentSourceCandidateFile({
        file: 'views/fallback.axml',
        getSourceCandidateSources: () => new Map([[suffixSource, '<view />']]),
        outDir: '/workspace/dist',
        rootDir: '/workspace',
      })).toBe(suffixSource)
    })

    expect(owner.removeSource(exactSource)).toEqual(new Set(['views/card.axml']))
    expect(owner.removeSource(suffixSource)).toEqual(new Set())
    expect(consumer.consume([])).toEqual(['views/card.axml'])
  })

  it('replaces dirty source ownership without retaining historical hashed outputs', () => {
    const owner = createViteSourceOutputRelationOwner()
    const consumerA = owner.createRemovalConsumer()
    const consumerB = owner.createRemovalConsumer()
    const sourceFile = '/workspace/source/views/card.axml'
    owner.recordOwnedOutput(sourceFile, 'views/card-0.axml')

    for (let revision = 1; revision <= 100; revision++) {
      const outputFile = `views/card-${revision}.axml`
      owner.observeSource(sourceFile)
      owner.recordOwnedOutput(sourceFile, outputFile)
      expect(consumerA.consume([outputFile])).toEqual([`views/card-${revision - 1}.axml`])
      expect(consumerB.consume([outputFile])).toEqual([`views/card-${revision - 1}.axml`])
      expect(owner.getStats()).toEqual({
        consumers: 2,
        dirtySources: 0,
        outputs: 1,
        pendingOutputs: 0,
        sources: 1,
      })
    }
  })

  it.each(['/workspace/theme.css', 'C:\\workspace\\theme.css', 'theme.css'])('keeps re-owned outputs omitted by a nested bundle (%s)', (sourceFile) => {
    const owner = createViteSourceOutputRelationOwner()
    const consumers = [owner.createRemovalConsumer(), owner.createRemovalConsumer()]
    owner.recordOwnedOutput(sourceFile, 'theme.acss')
    owner.recordOwnedOutput(sourceFile, 'obsolete.acss')
    owner.observeSource(sourceFile)
    owner.recordOwnedOutput(sourceFile, 'theme.acss')
    for (const consumer of consumers) {
      expect(consumer.consume([])).toEqual(['obsolete.acss'])
    }
    owner.removeSource(sourceFile)
    owner.observeSource(sourceFile)
    owner.recordOwnedOutput(sourceFile, 'theme.acss')
    for (const consumer of consumers) {
      expect(consumer.consume([])).toEqual([])
    }
    owner.removeSource(sourceFile)
    for (const consumer of consumers) {
      expect(consumer.consume([])).toEqual(['theme.acss'])
    }
  })

  it('does not retain dirty revisions for sources without owned outputs', () => {
    const owner = createViteSourceOutputRelationOwner()
    for (let revision = 0; revision < 100; revision++) {
      owner.observeSource(`/workspace/source/unowned-${revision}.axml`)
    }
    expect(owner.getStats().dirtySources).toBe(0)
  })
})
