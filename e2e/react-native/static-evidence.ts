import type { ReactNativeCaseResult, ReactNativeReport } from './catalog'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { nativeBuildCases, nativeFixtures, rejectedNativeCases } from '../../examples/react-native-expo/src/compatibility/protocol'
import { createNativeStyleRuntime } from '../../packages/react-native/src/runtime'
import { generateNativeStylesheetEvidence } from '../../packages/react-native/src/tailwind/generate'
import { compatibilityCases, reactNativeVersions, RN_CATALOG_HASH, RN_FIXTURE_HASH } from './catalog'
import { generatedRules, matchGeneratedDeclaration, styleContains } from './declarations'

const repoRoot = path.resolve(import.meta.dirname, '../..')
const exampleRoot = path.resolve(repoRoot, 'examples/react-native-expo')

export async function collectStaticEvidence() {
  const candidates = new Set(compatibilityCases.flatMap(item => item.className.split(/\s+/).filter(Boolean)))
  candidates.add('flex')
  const evidence = await generateNativeStylesheetEvidence({
    projectRoot: exampleRoot,
    cssEntries: ['global.css', 'styles/legacy.css', 'styles/prefix.css', 'styles/reference.css'].map(file => path.resolve(exampleRoot, file)),
    candidates,
    sourceGlobs: ['./src/**/*.{js,jsx,ts,tsx}', './App.tsx', '../../tools/tailwindcss-test-catalog/compatibility-candidates.txt'],
  })
  const { manifest, rawCss, generatedClassSet } = evidence
  const rules = generatedRules(rawCss)
  const runtime = createNativeStyleRuntime(manifest)
  const results: ReactNativeCaseResult[] = compatibilityCases.map((item) => {
    const tokens = (item.id === 'directive-import' ? 'flex' : item.className).split(/\s+/).filter(Boolean)
    const matched = rules.filter(rule => rule.classes.some(token => tokens.includes(token)))
    const declarations = item.declarations.map(expected => ({ expected, actual: matchGeneratedDeclaration(matched, expected) }))
    const generated = tokens.length > 0 && tokens.every(token => generatedClassSet.includes(token)) && declarations.every(entry => entry.actual)
    const warnings = manifest.warnings.filter(entry => entry.className && tokens.includes(entry.className)).map(entry => entry.message)
    const encodedStyle = runtime.tw(tokens, { colorScheme: 'dark', platform: 'ios' }) as Record<string, unknown>
    const completeTokens = tokens.every(token => Boolean(manifest.rules[token]?.length))
    const expectedStyle = nativeFixtures[item.id]?.style
    const encoded = completeTokens && warnings.length === 0 && (!expectedStyle || styleContains(encodedStyle, expectedStyle))
    const rejected = rejectedNativeCases.has(item.id)
    const status: ReactNativeCaseResult['status'] = !generated ? 'failed' : rejected ? (!encoded ? 'unsupported' : 'failed') : !encoded ? 'failed' : nativeBuildCases.has(item.id) ? 'supported' : 'unverified'
    const reason = !generated
      ? 'Tailwind 未生成全部精确候选及预期声明'
      : rejected
        ? (encoded ? '原生支持边界发生变化，必须补夹具并审查预期' : '原生编码明确拒绝或未完整保留该语义')
        : !encoded
            ? '原生编码丢失声明或与独立样式预期不符'
            : status === 'unverified' ? '等待本轮逐项原生几何与像素证据' : undefined
    return {
      id: item.id,
      status,
      reason,
      warnings,
      generated,
      encoded,
      encodedStyle,
      generatedDeclarations: declarations.flatMap(entry => entry.actual ? [entry.actual] : []),
      checkpoints: [
        { name: 'generation:candidates', passed: tokens.every(token => generatedClassSet.includes(token)) },
        ...declarations.map(({ expected, actual }, index) => ({ name: `generation:declaration:${index}:${expected.property}`, passed: Boolean(actual), actual: actual?.value, expected: expected.value })),
        { name: 'encoder:complete', passed: encoded },
        ...(rejected ? [{ name: 'encoder:expected-rejection', passed: generated && !encoded }] : []),
      ],
    }
  })
  return { ...evidence, results }
}

export async function writeStaticEvidence(outputFile: string) {
  const evidence = await collectStaticEvidence()
  const report: ReactNativeReport = {
    schemaVersion: 2,
    stage: 'static',
    revision: 'static',
    platform: 'web',
    catalogHash: RN_CATALOG_HASH,
    fixtureHash: RN_FIXTURE_HASH,
    runId: 'static-generation',
    verifiedAt: new Date().toISOString(),
    versions: reactNativeVersions(),
    environment: { deviceName: 'static-export', osName: 'Node', osVersion: process.version, runtimeIdentifier: 'metro-static', abi: process.arch, viewport: { width: 0, height: 0, pixelRatio: 1 } },
    results: evidence.results,
    receipts: [],
  }
  await fs.mkdir(path.dirname(outputFile), { recursive: true })
  await fs.writeFile(outputFile, `${JSON.stringify({ schemaVersion: 2, catalogHash: RN_CATALOG_HASH, fixtureHash: RN_FIXTURE_HASH, cases: compatibilityCases, report, manifest: evidence.manifest, generatedClassSet: evidence.generatedClassSet, rawCss: evidence.rawCss }, null, 2)}\n`, 'utf8')
  return report
}
