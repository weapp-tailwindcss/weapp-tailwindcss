import { postcss } from '@weapp-tailwindcss/postcss'
import { expect, it, vi } from 'vitest'
import { CompilationSessionPool } from '../packages/weapp-tailwindcss/src/compiler'
import { createWeappTailwindcssGenerator, resolveTailwindV4Source } from '../packages/weapp-tailwindcss/src/generator'

const PAGE_COUNT = 151
const COMPONENT_COUNT = 151

interface ProbeBundle {
  committed: boolean
  template: string
  style: string
}

async function createNativeStyleBundles(scopes: ReadonlyArray<{ kind: 'page' | 'component', name: string }>) {
  const localRules = scopes.map((_scope, index) => `.wtu-probe-${index} { @apply flex; }`).join('\n')
  const source = await resolveTailwindV4Source({
    base: process.cwd(),
    css: `@import "tailwindcss" source(none);\n${localRules}`,
  })
  const generated = await createWeappTailwindcssGenerator(source).generate({
    target: 'weapp',
    candidates: [],
    scanSources: false,
  })
  const styles = new Map<string, string>()
  postcss.parse(generated.css).walkRules((rule) => {
    for (const selector of rule.selectors ?? []) {
      const match = selector.match(/^\.wtu-probe-(\d+)$/)
      if (match) {
        styles.set(match[1]!, rule.toString())
      }
    }
  })
  return styles
}

it('keeps every Android Vapor page and component style scope committed under load', async () => {
  const pool = new CompilationSessionPool()
  let started = 0
  let release!: () => void
  const pending = new Promise<void>((resolve) => {
    release = resolve
  })
  const scopes = [
    ...Array.from({ length: PAGE_COUNT }, (_, index) => ({ kind: 'page' as const, name: `page-${index}` })),
    ...Array.from({ length: COMPONENT_COUNT }, (_, index) => ({ kind: 'component' as const, name: `component-${index}` })),
  ]
  const styles = await createNativeStyleBundles(scopes)

  try {
    const executions = scopes.map((scope, index) => pool.run({
      scope: { id: `issue-1340/${scope.kind}/${scope.name}.css`, kind: scope.kind },
      outputId: `issue-1340/${scope.kind}/${scope.name}.css`,
      sources: [{
        id: `/issue-1340/${scope.kind}/${scope.name}.uvue`,
        kind: 'css',
        candidates: [`probe-${index}`],
        content: `.probe-${index} { @apply flex; }`,
      }],
    }, async (compilation) => {
      started += 1
      await pending
      return { classSet: compilation.candidates }
    }))

    await vi.waitFor(() => {
      expect(started).toBe(scopes.length)
    })
    expect(pool.size).toBe(scopes.length)
    release()
    const results = await Promise.all(executions)
    const bundles: ProbeBundle[] = results.map((result, index) => ({
      committed: result.committed,
      template: `template-${index}.cpp.bytes:wtu-probe-${index}`,
      style: result.committed ? styles.get(String(index)) ?? '' : '',
    }))
    const missing = bundles.filter((bundle, index) => bundle.committed && !bundle.style.includes(`.wtu-probe-${index}`))
    const empty = bundles.filter(bundle => bundle.committed && bundle.style.trim().length === 0)
    const rawApply = bundles.filter(bundle => bundle.style.includes('@apply'))
    const uncommitted = bundles.filter(bundle => !bundle.committed)
    const withoutDeclarations = bundles.filter((bundle, index) => {
      if (!bundle.committed) {
        return false
      }
      let declarationCount = 0
      postcss.parse(bundle.style).walkRules(`.wtu-probe-${index}`, (rule) => {
        rule.walkDecls(() => declarationCount++)
      })
      return declarationCount === 0
    })

    expect(uncommitted).toEqual([])
    expect(missing).toEqual([])
    expect(empty).toEqual([])
    expect(rawApply).toEqual([])
    expect(withoutDeclarations).toEqual([])
    expect(styles.size).toBe(scopes.length)
    await vi.waitFor(() => {
      expect(pool.size).toBeLessThanOrEqual(128)
    })
    await expect({
      pages: PAGE_COUNT,
      components: COMPONENT_COUNT,
      templatesWithUtilities: bundles.filter(bundle => bundle.template.includes('wtu-')).length,
      styleBundlesWithUtilities: bundles.filter(bundle => bundle.style.includes('wtu-')).length,
      missingStyleBundles: missing.length,
      emptyStyleBundles: empty.length,
      rawApplyStyleBundles: rawApply.length,
      styleBundlesWithoutDeclarations: withoutDeclarations.length,
      uncommittedScopes: uncommitted.length,
      poolSizeAfterDrain: pool.size,
    }).toMatchFileSnapshot('./__snapshots__/issue-1340/summary.json')
  }
  finally {
    await pool.dispose()
  }
})
