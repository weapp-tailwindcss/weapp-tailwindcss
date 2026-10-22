import type { NativePairEvidence, ReactNativeReport } from '../../examples/react-native-expo/src/compatibility/protocol'
import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { PNG } from 'pngjs'
import { expectedFixtureStyle, nativeBuildFixtures, nativeFixtures, rejectedNativeCases } from '../../examples/react-native-expo/src/compatibility/protocol'
import { compatibilityCases, reactNativeVersions, RN_CATALOG_HASH, RN_FIXTURE_HASH } from './catalog'
import { syntheticFrameCapture } from './frame-fixture'
import { syntheticImagePair } from './image-fixture'
import { runtimeIdentity } from './installation-evidence'
import { syntheticRuntimeInstallation } from './installation-fixture'
import { assessNativePair } from './pair-evidence'
import { syntheticScrollPair } from './scroll-fixture'

/** 构造有真实 PNG 和独立样式 oracle 的纯运行时报告，不伪装设备验收。 */
export async function writeRuntimeFixture(artifacts: string, platform: ReactNativeReport['platform'], runId: string, observedAt: string, revision = 'rn-hmr-updated-f59e0b') {
  await mkdir(artifacts, { recursive: true })
  const image = new PNG({ width: 64, height: 64 })
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      const offset = (y * image.width + x) * 4
      image.data[offset] = (x % 32) * 7
      image.data[offset + 1] = y * 9
      image.data[offset + 2] = (x % 32 + y) * 3
      image.data[offset + 3] = 255
    }
  }
  const raw: ReactNativeReport = {
    runtimeInstallation: syntheticRuntimeInstallation(),
    schemaVersion: 2,
    stage: 'runtime',
    revision,
    platform,
    catalogHash: RN_CATALOG_HASH,
    fixtureHash: RN_FIXTURE_HASH,
    runId,
    verifiedAt: observedAt,
    versions: reactNativeVersions(),
    environment: { deviceName: 'synthetic-unit-fixture', osName: platform, osVersion: '1', runtimeIdentifier: 'unit', abi: 'unit', viewport: { width: 64, height: 64, pixelRatio: 1 }, ...(platform === 'web' ? { browser: { name: 'chromium', version: '1' } as const } : {}) },
    results: [],
    receipts: [],
  }
  for (const item of compatibilityCases) {
    const rejected = rejectedNativeCases.has(item.id)
    const result: ReactNativeReport['results'][number] = {
      id: item.id,
      status: rejected ? 'unsupported' : 'supported',
      ...(rejected ? { reason: '独立编码边界' } : {}),
      generated: true,
      encoded: !rejected,
      warnings: rejected ? ['此单测的独立候选编码拒绝诊断'] : [],
      generatedDeclarations: [],
      encodedStyle: nativeBuildFixtures[item.id]?.style ?? {},
      checkpoints: [
        { name: 'generation:candidates', passed: true },
        ...item.declarations.map((declaration, index) => ({ name: `generation:declaration:${index}:${declaration.property}`, passed: true })),
        { name: 'encoder:complete', passed: !rejected },
        ...(rejected ? [{ name: 'encoder:expected-rejection', passed: true }] : []),
      ],
    }
    for (const phase of nativeFixtures[item.id]?.phases ?? (nativeFixtures[item.id] ? ['default'] : [])) {
      let pair: NativePairEvidence = {
        runtimeInstallation: runtimeIdentity(raw.runtimeInstallation!),
        runId: raw.runId,
        platform,
        revision: raw.revision,
        id: item.id,
        phase,
        probe: { x: 0, y: 0, width: 24, height: 24 },
        reference: { x: 32, y: 0, width: 24, height: 24 },
        control: { x: 0, y: 32, width: 24, height: 24 },
        target: { x: 2, y: 2, width: 8, height: 8 },
        referenceTarget: { x: 34, y: 2, width: 8, height: 8 },
        controlTarget: { x: 2, y: 34, width: 8, height: 8 },
        viewport: raw.environment.viewport,
      }
      const expectsEffect = Object.keys(expectedFixtureStyle(item.id, phase, platform)!).length > 0
      for (let y = 0; y < 24; y++) {
        for (let x = 0; x < 24; x++) {
          const source = (y * image.width + x) * 4
          const destination = ((y + 32) * image.width + x) * 4
          image.data.set(expectsEffect ? [226, 232, 240, 255] : image.data.subarray(source, source + 4), destination)
        }
      }
      if (item.id === 'syntax-important') {
        const rgba = phase.endsWith('-normal') ? [220, 38, 38, 255] : [115, 115, 115, 255]
        for (const side of ['probe', 'reference', 'control'] as const) {
          const rect = pair[side]
          for (let y = rect.y; y < rect.y + rect.height; y++) {
            for (let x = rect.x; x < rect.x + rect.width; x++) {
              image.data.set(side === 'control' ? [192, 38, 211, 255] : rgba, (y * image.width + x) * 4)
            }
          }
        }
      }
      let phaseImage = image
      if (item.id === 'sizing-size' && phase === 'image') {
        const synthetic = syntheticImagePair(pair)
        pair = synthetic.pair
        phaseImage = synthetic.image
      }
      if (item.id === 'sizing-size' && phase.startsWith('scroll-')) {
        const synthetic = syntheticScrollPair(pair)
        pair = synthetic.pair
        phaseImage = synthetic.image
      }
      const png = PNG.sync.write(phaseImage)
      const checkpoints = assessNativePair(phaseImage, pair)
      const name = `case-${raw.revision}-${item.id}-${phase}.png`
      const artifact = { name, sha256: createHash('sha256').update(png).digest('hex'), byteLength: png.length }
      const receipt = { runtimeInstallation: pair.runtimeInstallation, id: item.id, phase, runId: raw.runId, checkpoints, artifact, capture: syntheticFrameCapture(artifact, checkpoints) }
      raw.receipts.push(receipt)
      result.checkpoints.push({ name: `runtime:${phase}:style`, passed: true, actual: JSON.stringify(expectedFixtureStyle(item.id, phase, platform)) }, ...checkpoints)
      await writeFile(path.join(artifacts, name), png)
      for (const frame of receipt.capture.frames) {
        await writeFile(path.join(artifacts, frame.artifact.name), png)
      }
      await writeFile(path.join(artifacts, `${name}.json`), JSON.stringify({ pair, receipt }))
    }
    raw.results.push(result)
  }
  await writeFile(path.join(artifacts, 'report.json'), JSON.stringify(raw))
  return raw
}
