import { describe, expect, it } from 'vitest'
import { normalizeMiniProgramGeneratorCssSource, normalizeMiniProgramImportShell } from '@/generation/output-import-shell'
import { resolveCssBundleOutputFile } from '@/bundlers/vite/generate-bundle/css-output-helpers'
import { resolveMiniProgramStyleOutputExtension } from '@/bundlers/vite/css-output'
import { linkEntryChunkStyles } from '@/bundlers/vite/generate-bundle/entry-style-graph'
import { shouldPreserveFrameworkRootMiniProgramImportShell } from '@/bundlers/vite/generate-bundle/root-style-output'

describe('Vite output import boundaries', () => {
  it('does not add cycles, duplicate transitive imports or ambiguous entry styles', () => {
    const bundle = {
      'entry.js': { type: 'chunk', fileName: 'entry.js', isEntry: true, modules: { theme: {}, cycle: {}, orphan: {} } },
      'entry.acss': { type: 'asset', fileName: 'entry.acss', source: '@import url("./with space.acss");' },
      'with space.acss': { type: 'asset', fileName: 'with space.acss', source: '@import "./theme.acss";' },
      'theme.acss': { type: 'asset', fileName: 'theme.acss', source: '.theme{}' },
      'cycle.acss': { type: 'asset', fileName: 'cycle.acss', source: '@import "./entry.acss";' },
      'orphan.acss': { type: 'asset', fileName: 'orphan.acss', source: '.orphan{}' },
    } as any
    const options = { matchesCss: (file: string) => file.endsWith('.acss'), resolveOutputFile: (id: string) => `${id}.acss` }
    linkEntryChunkStyles(bundle, options)
    expect(bundle['entry.acss'].source).toBe('@import "./orphan.acss";\n@import url("./with space.acss");')
    bundle['entry.js'].isEntry = false
    bundle['entry.acss'].source = ''
    linkEntryChunkStyles(bundle, options)
    expect(bundle['entry.acss'].source).toBe('')
    bundle['entry.js'].isEntry = true
    bundle['entry.css'] = { type: 'asset', fileName: 'entry.css', source: '' }
    linkEntryChunkStyles(bundle, { ...options, matchesCss: () => true })
    expect(bundle['entry.acss'].source).toBe('')
  })

  it.each(['/project/styles/theme.css', 'C:\\project\\styles\\theme.css'])('links emitted styles using entry chunk module ownership: %s', (id) => {
    const bundle = {
      'bootstrap.js': { type: 'chunk', fileName: 'bootstrap.js', isEntry: true, modules: { [id]: {} } },
      'bootstrap.acss': { type: 'asset', fileName: 'bootstrap.acss', source: '' },
      'styles/theme.acss': { type: 'asset', fileName: 'styles/theme.acss', source: '.h-8{height:64rpx}' },
      'other.acss': { type: 'asset', fileName: 'other.acss', source: '.unrelated{}' },
    } as any
    const options = { matchesCss: (file: string) => file.endsWith('.acss'), resolveOutputFile: (file: string) => file === id ? 'styles/theme.acss' : undefined }
    linkEntryChunkStyles(bundle, options)
    expect(bundle['bootstrap.acss'].source).toBe('@import "./styles/theme.acss";\n')
    linkEntryChunkStyles(bundle, options)
    expect(bundle['bootstrap.acss'].source).toBe('@import "./styles/theme.acss";\n')
    expect(bundle['other.acss'].source).toBe('.unrelated{}')
  })

  it('does not infer a platform extension from a matcher accepting every stylesheet', () => {
    expect(resolveMiniProgramStyleOutputExtension({ cssMatcher: () => true, stem: 'entry', files: ['entry.css'] })).toBe('.css')
    expect(resolveMiniProgramStyleOutputExtension({ cssMatcher: file => file.endsWith('.acss'), stem: 'entry' })).toBe('.acss')
  })
  it('removes a replayed CSS self import before generation', () => {
    expect(normalizeMiniProgramGeneratorCssSource('@import "generated.css"; @import "tailwindcss";', 'generated.css', ['generated.css'])).toBe('@import "tailwindcss";')
  })

  it('does not move a root bundle key after the framework relocates its asset', () => {
    expect(resolveCssBundleOutputFile({
      assetOutputFile: 'feature/screen.css',
      bundleFiles: ['screen4.css'],
      defaultStyleOutputExtension: '.css',
      file: 'screen4.css',
      isWebGeneratorTarget: false,
      opts: { cssMatcher: () => true } as any,
      pipelineContext: {} as any,
      cssPipelineStrategy: { shouldMoveRootMiniProgramStyleToImportShellOrigin: () => true },
      shouldPreserveAppCssExtension: true,
    })).toBe('screen4.css')
  })
  it.each(['.css', '.acss', '.wxss'])('preserves framework root shells with the actual %s output extension', (extension) => {
    expect(shouldPreserveFrameworkRootMiniProgramImportShell({
      css: `@import "./generated-theme${extension}";`,
      file: `entry${extension}`,
      matchesCss: true,
      isWebGeneratorTarget: false,
      shouldKeep: () => true,
    })).toBe(true)
  })

  it('normalizes CSS imports using known output identities without rewriting package imports', () => {
    const css = '@import "generated-theme.css"; @import "tailwindcss/theme.css"; @import "unknown.css";'
    expect(normalizeMiniProgramImportShell(css, {
      outputFile: 'entry.css',
      outputFiles: ['entry.css', 'generated-theme.css'],
    })).toBe('@import "./generated-theme.css"; @import "tailwindcss/theme.css"; @import "unknown.css";')
    expect(normalizeMiniProgramImportShell(css)).toBe(css)
  })

  it('uses bundle paths for nested output imports and leaves Web shells to the Web pipeline', () => {
    expect(normalizeMiniProgramImportShell('@import "theme.css";', {
      outputFile: 'feature/entry.css',
      outputFiles: ['feature/theme.css'],
    })).toBe('@import "./theme.css";')
    expect(shouldPreserveFrameworkRootMiniProgramImportShell({
      css: '@import "./theme.css";', file: 'entry.css', matchesCss: true, isWebGeneratorTarget: true, shouldKeep: () => true,
    })).toBe(false)
  })
})
