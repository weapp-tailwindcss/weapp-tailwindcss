import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { beforeAll, expect, it } from 'vitest'
import { fixtureClassValue, fixtureInlineStyle } from '../examples/react-native-expo/src/compatibility/protocol'
import { compileNativeStylesheet } from '../packages/react-native/src/compiler'
import { createNativeStyleRuntime } from '../packages/react-native/src/runtime'
import { flattenInlineStyle } from '../packages/react-native/src/runtime/line-height'
import { generateNativeStylesheetEvidence } from '../packages/react-native/src/tailwind/generate'
import { validateAuthoringEvidence } from './react-native/authoring-evidence'
import { compatibilityCases, RN_CATALOG_HASH, RN_FIXTURE_HASH } from './react-native/catalog'
import { collectStaticEvidence } from './react-native/static-evidence'
import { validateStaticGenerationInput } from './react-native/static-input-evidence'

let evidence: Awaited<ReturnType<typeof collectStaticEvidence>>
beforeAll(async () => {
  evidence = await collectStaticEvidence()
})

it('已提交 static 基线与当前生成逐字一致，禁止正常回归自动更新', async () => {
  const saved = JSON.parse(await readFile(path.resolve(import.meta.dirname, '../examples/react-native-expo/src/compatibility/static-evidence.json'), 'utf8'))
  expect(saved.schemaVersion).toBe(2)
  expect(saved.catalogHash).toBe(RN_CATALOG_HASH)
  expect(saved.fixtureHash).toBe(RN_FIXTURE_HASH)
  expect(saved.cases).toEqual(compatibilityCases)
  expect(saved.manifest).toEqual(evidence.manifest)
  expect(saved.rawCss).toBe(evidence.rawCss)
  expect(saved.generatedClassSet).toEqual(evidence.generatedClassSet)
  expect(saved.generation).toEqual(evidence.generation)
  // JSON 持久化会移除 undefined 字段，比较同样的序列化边界。
  expect(saved.report.results).toEqual(JSON.parse(JSON.stringify(evidence.results)))
})

it.each(['inline-important', 'inline-normal', 'class-important', 'class-normal'])('归档的真实 Tailwind manifest 在 %s 阶段保持独立竞争语义', (phase) => {
  const runtime = createNativeStyleRuntime(evidence.manifest)
  const value = fixtureClassValue('!bg-[#737373]', 'syntax-important', phase)
  const actual = flattenInlineStyle(runtime.composeStyle(runtime.tw(value), fixtureInlineStyle('syntax-important', phase)))
  expect(actual).toEqual({ backgroundColor: phase.endsWith('-normal') ? '#dc2626' : '#737373' })
})

it('主归档精确等于 Metro global.css 入口的真实生成，独立 config 不能污染运行时', async () => {
  const projectRoot = path.resolve(import.meta.dirname, '../examples/react-native-expo')
  const metro = await generateNativeStylesheetEvidence({
    projectRoot,
    cssEntries: [path.join(projectRoot, 'global.css')],
    sourceGlobs: ['./src/**/*.{js,jsx,ts,tsx}', './App.tsx', '../../tools/tailwindcss-test-catalog/compatibility-candidates.txt'],
  })
  expect(isDeepStrictEqual(evidence.manifest, metro.manifest)).toBe(true)
  expect(evidence.rawCss).toBe(metro.rawCss)
  expect(evidence.generatedClassSet).toEqual(metro.generatedClassSet)
})

it('主输入与全部独立 authoring 产物可以从归档 CSS 回放，旧混合作用域不放行', async () => {
  const input = { schemaVersion: 2, fixtureHash: RN_FIXTURE_HASH, ...evidence }
  await expect(validateStaticGenerationInput(input)).resolves.toBeUndefined()
  const old = structuredClone(input)
  old.generation.version = 1
  await expect(validateStaticGenerationInput(old)).rejects.toThrow('合同')
})

it.each(['candidate-leak', 'missing-important', 'wrong-value', 'rewritten-source', 'rewritten-manifest'] as const)('独立 authoring 的 %s 即使重新计算产物也不能通过', async (mode) => {
  const authoring = structuredClone(evidence.generation.authoring)
  const legacy = authoring.scopes.find(scope => scope.id === 'legacy')!
  if (mode === 'candidate-leak') {
    legacy.generatedClassSet.push('bg-[#737373]')
  }
  else if (mode === 'missing-important') {
    legacy.rawCss = legacy.rawCss.replaceAll('!important', '')
    legacy.manifest = compileNativeStylesheet(legacy.rawCss)
  }
  else if (mode === 'wrong-value') {
    legacy.rawCss = legacy.rawCss.replaceAll('19px', '23px')
    legacy.manifest = compileNativeStylesheet(legacy.rawCss)
  }
  else if (mode === 'rewritten-source') {
    legacy.sources[0]!.source += '\n/* 未参与生成的旧输入 */'
  }
  else {
    legacy.manifest.rules['p-legacy']![0]!.important = false
  }
  await expect(validateAuthoringEvidence(authoring)).rejects.toThrow(/authoring/)
})
