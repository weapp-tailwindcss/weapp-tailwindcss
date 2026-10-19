import type { DefaultDesignSystem, InventoryDeclaration, TailwindInventory, UtilityInventoryEntry } from './types'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { functionalValueProfiles } from '../../../tools/tailwindcss-test-catalog/src/value-profiles'
import { utilitySemanticWitnesses, utilityWitnessSupplements, variantWitnessSupplements } from './supplements'

const require = createRequire(import.meta.url)

export async function loadDefaultDesignSystem() {
  const { __unstable__loadDesignSystem } = await import('tailwindcss')
  const theme = await readFile(require.resolve('tailwindcss/theme.css'), 'utf8')
  return __unstable__loadDesignSystem(theme)
}

function targetedCandidate(ds: DefaultDesignSystem, candidate: string, kind: 'static' | 'functional', root: string) {
  return ds.parseCandidate(candidate).find(parsed => parsed.kind === kind && parsed.root === root && ds.compileAstNodes(parsed).length > 0)
}

function declarationsFor(ds: DefaultDesignSystem, candidate: string): InventoryDeclaration[] {
  const declarations: InventoryDeclaration[] = []
  const visit = (nodes: unknown[]) => {
    for (const node of nodes as Array<{ kind: string, property?: string, value?: string, important?: boolean, nodes?: unknown[] }>) {
      if (node.kind === 'declaration' && node.property && node.value !== undefined) {
        declarations.push({ property: node.property, value: node.value, important: node.important ?? false })
      }
      if (node.nodes) {
        visit(node.nodes)
      }
    }
  }
  visit(ds.candidatesToAst([candidate])[0] ?? [])
  return declarations
}

function profileCandidate(root: string, value: string) {
  if (value.startsWith('/')) {
    return `${root}-red-500${value}`
  }
  if (value.startsWith('-')) {
    return `${root.startsWith('-') ? root : `-${root}`}-${value.slice(1)}`
  }
  return `${root}-${value}`
}

export async function collectInventory(designSystem?: DefaultDesignSystem): Promise<TailwindInventory> {
  const ds = designSystem ?? await loadDefaultDesignSystem()
  const completions = ds.getClassList().map(([candidate, info]) => ({ candidate, modifiers: info.modifiers ?? [] })).sort((left, right) => left.candidate.localeCompare(right.candidate, 'en'))
  const completionByIdentity = new Map<string, string[]>()
  for (const { candidate } of completions) {
    for (const parsed of ds.parseCandidate(candidate)) {
      if (parsed.kind === 'arbitrary') {
        continue
      }
      const id = `${parsed.kind}/${parsed.root}`
      const values = completionByIdentity.get(id) ?? []
      values.push(candidate)
      completionByIdentity.set(id, values)
    }
  }
  const utilities: UtilityInventoryEntry[] = []
  const supplements: TailwindInventory['supplements'] = []
  for (const kind of ['static', 'functional'] as const) {
    for (const root of ds.utilities.keys(kind).sort()) {
      const preferred = kind === 'static' ? [root] : utilitySemanticWitnesses[root] ? [utilitySemanticWitnesses[root]!] : []
      const candidates = [...preferred, ...(completionByIdentity.get(`${kind}/${root}`) ?? []), ...(utilityWitnessSupplements[root] ?? [])]
      const profileWitnesses: UtilityInventoryEntry['profileWitnesses'] = []
      if (kind === 'functional') {
        for (const profile of functionalValueProfiles) {
          const candidate = profile.values.map(value => profileCandidate(root, value))
            .find(value => targetedCandidate(ds, value, kind, root))
          if (candidate) {
            profileWitnesses.push({ profile: profile.id, candidate })
            candidates.push(candidate)
          }
        }
      }
      const witness = candidates.find(candidate => targetedCandidate(ds, candidate, kind, root))
      if (!witness || !ds.candidatesToCss([witness])[0]) {
        throw new Error(`上游 utility 没有合法编译见证：${kind}/${root}；必须显式补充合法输入，不能默认为 rejected。`)
      }
      if (!(completionByIdentity.get(`${kind}/${root}`)?.length)) {
        supplements.push({ root: `${kind}/${root}`, reason: '上游补全未枚举该注册项；显式见证通过 parse root/kind 与目标编译节点验证。' })
      }
      utilities.push({ id: `utility/${kind}/${root}`, kind, root, witness, declarations: declarationsFor(ds, witness), profileWitnesses })
    }
  }
  const suggestions = new Map(ds.getVariants().map(variant => [variant.name, variant]))
  const variants = [...ds.variants.entries()].map(([root, variant]) => {
    const witness = variantWitnessSupplements[root] ?? `${root}:flex`
    const parsed = ds.parseCandidate(witness).find(candidate => candidate.variants.some(item => item.kind !== 'arbitrary' && item.root === root))
    if (!parsed || !ds.candidatesToCss([witness])[0]) {
      throw new Error(`上游 variant 没有合法编译见证：${root}；必须显式登记。`)
    }
    const suggestion = suggestions.get(root)
    return { id: `variant/${variant.kind}/${root}`, root, kind: variant.kind as 'static' | 'functional' | 'compound', witness, compounds: variant.compounds, compoundsWith: variant.compoundsWith, values: suggestion?.values ?? [], isArbitrary: suggestion?.isArbitrary ?? false }
  }).sort((left, right) => left.id.localeCompare(right.id, 'en'))
  const theme = await readFile(require.resolve('tailwindcss/theme.css'), 'utf8')
  const { version } = require('tailwindcss/package.json') as { version: string }
  return { schemaVersion: 1, tailwindcss: version, themeSha256: createHash('sha256').update(theme).digest('hex'), utilities, variants, completions, supplements }
}
