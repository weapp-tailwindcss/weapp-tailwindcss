import { describe, expect, it } from 'vitest'
import { createFrameworkRootStyleOwnership } from '@/bundlers/vite/generate-bundle/framework-root-style'
import { resolveFrameworkRootImportShellPlan, resolveSingleCssImportOutputFile } from '@/bundlers/vite/generate-bundle/root-style-output'

describe('framework root output identities', () => {
  it.each([
    ['bootstrap.wxss', './theme.wxss', 'theme.wxss'],
    ['.\\bootstrap.acss', '.\\theme.acss', 'theme.acss'],
    ['bootstrap.ttss', '/theme.ttss', 'theme.ttss'],
    ['nested/entry.wxss', '../theme.wxss?updated=1', 'theme.wxss'],
    ['nested\\entry.acss', '..\\theme.acss', 'theme.acss'],
    ['C:\\output\\entry.wxss', '.\\theme.wxss', 'C:/output/theme.wxss'],
    ['/output/entry.ttss', './theme.ttss', '/output/theme.ttss'],
  ])('resolves output import %s -> %s', (file, request, expected) => {
    expect(resolveSingleCssImportOutputFile(file, `@import ${JSON.stringify(request)};`)).toBe(expected)
  })

  it.each(['framework.wxss', './framework.wxss', '.\\framework.wxss'])('reserves a mapped target for its owner %s', (owner) => {
    const relations = new Map([[owner, '.\\theme.wxss']])
    expect(createFrameworkRootStyleOwnership('bootstrap.wxss', relations)('theme.wxss')).toBe(false)
    expect(createFrameworkRootStyleOwnership('framework.wxss', relations)('./theme.wxss')).toBe(true)
    expect(createFrameworkRootStyleOwnership('theme.wxss', relations)('theme.wxss')).toBe(true)
    expect(createFrameworkRootStyleOwnership('components/card.wxss', relations)('theme.wxss')).toBe(true)
    expect(createFrameworkRootStyleOwnership('bootstrap.wxss', relations)('independent.wxss')).toBe(true)
    relations.clear()
    expect(createFrameworkRootStyleOwnership('bootstrap.wxss', relations)('theme.wxss')).toBe(true)
  })

  it.each([
    ['@import "./new.acss";', 'new.acss'],
    ['@import "/new.acss";', 'new.acss'],
    ['@import "./one.acss"; @import "./two.acss";', undefined],
    ['@import "./nested/new.acss";', undefined],
    ['@import "./bootstrap.acss";', undefined],
  ])('uses the current shell rather than a stale target: %s', (rawSource, targetToRemember) => {
    expect(resolveFrameworkRootImportShellPlan({
      assetSourceFile: 'bootstrap.acss', file: 'bootstrap.acss',
      configuredTargetFiles: [], processedTargetFiles: [],
      isMainChunk: true, isWebGeneratorTarget: false, matchesCss: true,
      rawSource, rememberedTarget: 'stale.acss', rootImportShellOutputFile: 'bootstrap.acss',
      shouldKeep: () => true, shouldMoveToOrigin: () => false,
    })).toEqual({ isCurrentImportShell: true, reusableTarget: undefined, targetToRemember })
  })
})
