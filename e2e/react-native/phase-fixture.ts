import type { ReactNativeReport } from './catalog'
import type { NativeRuntimePhase } from './phase-contract'
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { virtualModuleCode } from '../../packages/react-native/src/metro/virtual-module'
import { generateNativeStylesheetEvidence } from '../../packages/react-native/src/tailwind/generate'
import { writeEncodingFixture } from './encoding-fixture'
import { exampleRoot, readRuntimeStyleInput } from './generation-input'
import { runtimeIdentity } from './installation-evidence'
import { syntheticRuntimeInstallation } from './installation-fixture'
import { nativeFrameName } from './pair-evidence'
import { nativeEncodingArtifactNames, nativePhaseForRevision, nativeRuntimePhases } from './phase-contract'
import { createNativePhaseIndex, nativePhaseDirectory, phaseIndexName, snapshotNativePhase } from './phase-index'

const generated = new Map<string, ReturnType<typeof phaseSource>>()

async function phaseSource(phase: NativeRuntimePhase) {
  const input = await readRuntimeStyleInput()
  const originalCss = await readFile(path.resolve(exampleRoot, input.options.input), 'utf8')
  const css = phase.id === 'css-hmr' ? originalCss.replace('#10b981', phase.cssColor) : originalCss
  const originalMarker = await readFile(path.join(exampleRoot, 'src', 'hmr-marker.ts'), 'utf8')
  const marker = originalMarker.replace('rn-hmr-baseline', phase.marker).replace('bg-emerald-500', phase.markerClass)
  const evidence = await generateNativeStylesheetEvidence({ projectRoot: exampleRoot, css, sourceGlobs: input.options.sourceGlobs, candidates: [phase.markerClass] })
  return { css, marker, manifest: evidence.manifest }
}

/** 每阶段使用真实生成 manifest；PNG 是带明确合成身份的纯回归输入。 */
export async function writeNativePhaseFixture(directory: string, finalReport: ReactNativeReport) {
  const index = createNativePhaseIndex(finalReport)
  for (const phase of nativeRuntimePhases) {
    const report = structuredClone(finalReport)
    report.revision = phase.revision
    if (!generated.has(phase.id)) {
      generated.set(phase.id, phaseSource(phase))
    }
    const { css, marker, manifest } = await generated.get(phase.id)!
    const root = nativePhaseDirectory(directory, phase)
    await mkdir(path.join(root, 'sources'), { recursive: true })
    const { source, ready } = await writeEncodingFixture(root, report, { manifest, publication: { revision: `synthetic-publication-${phase.id}`, virtualPath: path.join(root, 'source-virtual-input.js') } })
    const { revision, manifestSha256 } = JSON.parse(ready)
    report.runtimeInstallation = syntheticRuntimeInstallation(source, revision)
    for (const saved of report.receipts) {
      const original = saved.artifact.name
      const name = `case-${phase.revision}-${saved.id}-${saved.phase}.png`
      const bytes = await readFile(path.join(directory, original))
      const metadata = JSON.parse(await readFile(path.join(directory, `${original}.json`), 'utf8'))
      saved.artifact.name = name
      for (const frame of saved.capture.frames) {
        const frameName = nativeFrameName(name, frame.index)
        await copyFile(path.join(directory, frame.artifact.name), path.join(directory, frameName))
        frame.artifact.name = frameName
      }
      saved.runtimeInstallation = runtimeIdentity(report.runtimeInstallation)
      metadata.pair.revision = phase.revision
      for (const load of metadata.pair.image?.loads ?? []) {
        load.revision = phase.revision
      }
      metadata.pair.runtimeInstallation = runtimeIdentity(report.runtimeInstallation)
      metadata.receipt.runtimeInstallation = runtimeIdentity(report.runtimeInstallation)
      metadata.receipt.artifact.name = name
      metadata.receipt.capture = structuredClone(saved.capture)
      await writeFile(path.join(directory, name), bytes)
      await writeFile(path.join(directory, `${name}.json`), JSON.stringify(metadata))
    }
    await writeFile(path.join(root, 'report.json'), JSON.stringify(report))
    await writeFile(path.join(root, 'sources', 'global.css'), css)
    await writeFile(path.join(root, 'sources', 'hmr-marker.ts'), marker)
    await writeFile(path.join(root, 'sources', 'virtual.js'), virtualModuleCode(manifest, { revision, manifestSha256 }, source))
    index.phases.push(await snapshotNativePhase(directory, phase))
    if (phase === nativeRuntimePhases.at(-1)) {
      Object.assign(finalReport, report)
      await writeFile(path.join(directory, 'report.json'), JSON.stringify(report))
    }
  }
  await writeFile(path.join(directory, phaseIndexName), JSON.stringify(index))
  const final = nativePhaseDirectory(directory, nativeRuntimePhases[nativeRuntimePhases.length - 1]!)
  await mkdir(path.join(directory, 'encoding'), { recursive: true })
  for (const name of nativeEncodingArtifactNames) {
    await copyFile(path.join(final, 'encoding', name), path.join(directory, 'encoding', name))
  }
}

/** 反例可重算摘要，但不能跳过生产侧的独立语义验证。 */
export async function updateNativePhaseFixtureReport(directory: string, report: ReactNativeReport) {
  const phase = nativePhaseForRevision(report.revision)
  await writeFile(path.join(nativePhaseDirectory(directory, phase), 'report.json'), JSON.stringify(report))
  const index = JSON.parse(await readFile(path.join(directory, phaseIndexName), 'utf8'))
  index.phases[nativeRuntimePhases.indexOf(phase)] = await snapshotNativePhase(directory, phase)
  await writeFile(path.join(directory, phaseIndexName), JSON.stringify(index))
}
