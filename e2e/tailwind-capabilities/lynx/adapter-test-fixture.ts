import type { NativeCaseResult, NativeGeometryEvidence, NativePlatformReport, NativeRect } from '../../../examples/react-lynx/src/compatibility/types'
import type { RunContext } from '../context'
import { Buffer } from 'node:buffer'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { PNG } from '../../lynx/png'
import { digest } from '../identity'
import { geometryValidators } from './contracts'

export const directories: string[] = []

export function rect(left: number, top: number, width: number, height: number): NativeRect {
  return { left, top, width, height, right: left + width, bottom: top + height }
}

function geometry(): NativeGeometryEvidence {
  return {
    probe: rect(6, 6, 44, 44),
    control: rect(206, 6, 90, 60),
    probeContainer: rect(0, 0, 160, 140),
    controlContainer: rect(200, 0, 160, 140),
    probeChild: rect(6, 6, 8, 8),
    controlChild: rect(206, 6, 8, 8),
  }
}

export async function fixture(id = 'sizing-size', status: NativeCaseResult['status'] = 'supported', hostGeometry = true) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'lynx adapter 中文 '))
  directories.push(root)
  const context: RunContext = { root, directory: root, runId: '0b12a000-0000-4000-8000-000000000001', startedAt: new Date(Date.now() - 1000).toISOString(), caseFilter: new RegExp(`^${id}$`) }
  const native = path.join(root, 'native')
  await mkdir(native)
  const bundle = Buffer.from('synthetic native bundle')
  const identity = { version: 1 as const, runId: context.runId, bundleSha256: digest(bundle) }
  const raw: NativePlatformReport = {
    schemaVersion: 1,
    platform: 'ios',
    catalogHash: 'fixture',
    verifiedAt: new Date().toISOString(),
    versions: { tailwindcss: '4.3.3', lynxEngine: '4.0.1', engineVersion: '4.0.1', cssDefines: '0.0.18' },
    environment: {
      deviceName: 'synthetic test',
      deviceModel: 'fixture',
      osName: 'iOS',
      osVersion: 'test',
      osBuild: 'test',
      runtimeIdentifier: 'synthetic',
      abi: 'arm64',
      viewport: { width: 400, height: 800, pixelRatio: 1 },
    },
    evidence: { ...identity, artifacts: [] },
    results: [{ id, status, checkpoints: [{ name: 'forged-checkpoint', passed: true }], geometry: geometry(), ...(status === 'unsupported' ? { reason: 'synthetic unsupported', failureStage: 'runtime' as const } : {}) }],
  }
  await writeFile(path.join(native, 'main.lynx.bundle'), bundle)
  await writeFile(path.join(native, 'run-context.json'), JSON.stringify(identity))
  const saveGeometry = async (images?: readonly Uint8Array[]) => {
    const crops = path.join(native, 'crops', context.runId)
    await mkdir(crops, { recursive: true })
    const sidecar = { ...identity, source: 'lynx-native-host-geometry-v1', id, platform: raw.platform, geometry: raw.results[0]!.geometry, ...(raw.results[0]!.screenMetrics ? { screenMetrics: raw.results[0]!.screenMetrics } : {}) }
    const files: Array<[string, Uint8Array]> = [[`${id}-geometry.json`, Buffer.from(JSON.stringify(sidecar))]]
    for (const [index, frame] of (['probe', 'control'] as const).entries()) {
      const rect = sidecar.geometry![`${frame}Container`]
      const image = new PNG({ width: rect.width, height: rect.height })
      image.data.fill(255)
      files.push([`${id}-geometry-${frame}.png`, images?.[index] ?? PNG.sync.write(image)])
    }
    for (const [name, bytes] of files) {
      await writeFile(path.join(crops, name), bytes)
      raw.evidence!.artifacts = raw.evidence!.artifacts.filter(item => item.name !== name)
      raw.evidence!.artifacts.push({ name, runId: context.runId, sha256: digest(bytes), byteLength: bytes.byteLength })
    }
  }
  const save = () => writeFile(path.join(native, 'report.json'), JSON.stringify(raw))
  if (hostGeometry && geometryValidators.has(id)) {
    await saveGeometry()
  }
  await save()
  return { context, raw, native, save, saveGeometry }
}
