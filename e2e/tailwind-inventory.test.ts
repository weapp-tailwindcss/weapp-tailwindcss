import { describe, expect, it } from 'vitest'
import { arbitrarySyntaxCases, authoringFixtures, catalogIdentity, catalogIdentityPayload, compatibilityCandidateMap, compatibilityCases, cssAuthoringCapabilities, functionalValueProfiles, officialFeatureManifest, sourceSyntaxCases, tailwindParityCandidateCategories, tailwindParityCandidates } from '../tools/tailwindcss-test-catalog/src'
import { collectInventory, loadDefaultDesignSystem, loadInventory, serializeInventory, validateInventory } from './tailwind-capabilities/inventory'

describe('Tailwind 上游完整能力清单', () => {
  it('完整比对固定版本全部 registry 和 completion，漂移必须显式登记', async () => {
    const actual = await collectInventory()
    const expected = await loadInventory()
    expect(() => validateInventory(actual, expected)).not.toThrow()
    expect(serializeInventory(actual)).toBe(serializeInventory(expected))
    expect(new Set(actual.utilities.map(item => item.id)).size).toBe(actual.utilities.length)
    expect(new Set(actual.variants.map(item => item.id)).size).toBe(actual.variants.length)
  })

  it('拒绝新 root、新变体、新补全和同 root 行为漂移', async () => {
    const expected = await loadInventory()
    for (const key of ['utilities', 'variants', 'completions'] as const) {
      const changed = { ...expected, [key]: expected[key].slice(1) }
      expect(() => validateInventory(changed, expected), key).toThrow(/漂移/)
    }
    const changed = { ...expected, utilities: expected.utilities.map((item, index) => index === 0 ? { ...item, witness: 'unknown' } : item) }
    expect(() => validateInventory(changed, expected)).toThrow(/utilities/)
  })

  it('任意语法正例必须真实生成，非法候选不能靠 parse 接受冒充有效', async () => {
    const ds = await loadDefaultDesignSystem()
    for (const item of arbitrarySyntaxCases) {
      expect(ds.candidatesToCss([item.candidate])[0], item.id).toBeTruthy()
    }
    for (const candidate of ['missing-utility', 'p-[', 'hover::p-4', `bg-\${color}-500`]) {
      expect(ds.candidatesToCss([candidate])[0], candidate).toBeNull()
    }
  })

  it('共享旧 ID、原子映射和官方功能 manifest 都完整且唯一', () => {
    const ids = compatibilityCases.map(item => item.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(compatibilityCandidateMap.map(item => item.caseId)).toEqual(ids)
    for (const feature of officialFeatureManifest) {
      expect(ids, `${feature.family}/${feature.id}`).toContain(feature.caseId)
    }
    expect(new Set(Object.values(tailwindParityCandidateCategories).flat())).toEqual(new Set(tailwindParityCandidates))
    expect(JSON.parse(catalogIdentityPayload)).toEqual(catalogIdentity)
  })

  it('作者语法、源表达式和无限值 profile 有独立输入及明确断言', () => {
    expect(authoringFixtures.map(item => item.id).sort()).toEqual([...cssAuthoringCapabilities].sort())
    for (const item of authoringFixtures) {
      expect(item.css, item.id).toBeTruthy()
      expect(item.expectedDeclarations.length, item.id).toBeGreaterThan(0)
    }
    for (const cases of [authoringFixtures, sourceSyntaxCases, functionalValueProfiles]) {
      expect(new Set(cases.map(item => item.id)).size).toBe(cases.length)
    }
    expect(sourceSyntaxCases.find(item => item.id === 'interpolation-negative')?.absentCandidates).toEqual(['bg-red-500', 'bg-blue-500'])
  })
})
