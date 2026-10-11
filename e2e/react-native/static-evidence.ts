import type { ReactNativeCaseResult } from './catalog'
import fs from 'node:fs/promises'
import path from 'node:path'
import { generateNativeStylesheet } from '../../packages/react-native/src/tailwind'
import { compatibilityCases, RN_CATALOG_HASH } from './catalog'
import { reportFromStaticEvidence } from './reports'

const repoRoot = path.resolve(import.meta.dirname, '../..')
const exampleRoot = path.resolve(repoRoot, 'examples/react-native-expo')

export async function collectStaticEvidence() {
  const candidates = new Set(compatibilityCases.flatMap(item => item.className.split(/\s+/).filter(Boolean)))
  const manifest = await generateNativeStylesheet({
    projectRoot: exampleRoot,
    cssEntries: [path.resolve(exampleRoot, 'global.css')],
    candidates,
    sourceGlobs: ['./src/**/*.{js,jsx,ts,tsx}', './App.tsx'],
  })
  const results: ReactNativeCaseResult[] = compatibilityCases.map((item) => {
    const tokens = item.className.split(/\s+/).filter(Boolean)
    const generated = tokens.every(token => manifest.classSet.includes(token))
    const bundled = tokens.every(token => Boolean(manifest.rules[token]?.length))
    const passed = item.evidence === 'build' ? generated && bundled : generated
    const compilerWarnings = manifest.warnings.filter(entry => entry.className && tokens.includes(entry.className)).map(entry => entry.message)
    const reason = compilerWarnings.join('; ') || (generated ? 'React Native encoder does not emit every serializable style rule' : 'Tailwind generator did not emit every candidate')
    return {
      id: item.id,
      status: passed ? 'supported' : 'unsupported',
      reason: passed ? undefined : reason,
      warnings: passed ? undefined : compilerWarnings.length ? compilerWarnings : [reason],
      checkpoints: [
        { name: 'build:generated', passed: generated },
        { name: 'build:bundled', passed: bundled },
      ],
    }
  })
  return { manifest, results }
}

export async function writeStaticEvidence(outputFile: string) {
  const { manifest, results } = await collectStaticEvidence()
  const report = reportFromStaticEvidence('web', results, {
    deviceName: 'static-export',
    osName: 'Web',
    osVersion: 'node',
    runtimeIdentifier: 'metro-static',
    abi: 'n/a',
    viewport: { width: 1280, height: 900, pixelRatio: 1 },
  })
  await fs.mkdir(path.dirname(outputFile), { recursive: true })
  await fs.writeFile(outputFile, `${JSON.stringify({ catalogHash: RN_CATALOG_HASH, cases: compatibilityCases, report, manifest }, null, 2)}\n`, 'utf8')
  return report
}
