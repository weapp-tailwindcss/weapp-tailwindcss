import type { NativePlatformReport } from '../examples/react-lynx/src/compatibility/types'
import type { RunContext } from './tailwind-capabilities/context'
import type { CaseContract } from './tailwind-capabilities/types'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { createEvidenceContext, sha256 } from './lynx/evidence'
import { overflowArtifactFixture } from './lynx/fixtures/overflow-artifacts'
import { overflowImage } from './lynx/fixtures/overflow-images'
import { readOverflowEvidence } from './lynx/overflow-evidence'
import { finalizeNativePixelEffects, validateNativePixelEvidence } from './lynx/pixel-evidence'
import { PNG } from './lynx/png'
import { validateLynxCase } from './tailwind-capabilities/lynx/validate'

vi.mock('../examples/react-lynx/src/compatibility/static-evidence.json', () => ({ default: { results: [{ id: 'layout-overflow', generated: true, bundled: true }] } }))

const directories: string[] = []
afterEach(async () => {
  await Promise.all(directories.splice(0).map(directory => fs.rm(directory, { recursive: true, force: true })))
})

async function fixture(clipped = true) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'lynx overflow evidence '))
  directories.push(root)
  const evidence = createEvidenceContext(new TextEncoder().encode('protocol-only bundle'))
  const crops = path.join(root, 'native', 'crops', evidence.runId)
  await fs.mkdir(crops, { recursive: true })
  const raw = { platform: 'ios', environment: { viewport: { pixelRatio: 3 } }, evidence: { ...evidence, artifacts: [] }, results: [{ id: 'layout-overflow' }] } as unknown as NativePlatformReport
  for (const [name, bytes] of overflowArtifactFixture(raw, clipped)) {
    await fs.writeFile(path.join(crops, name), bytes)
  }
  async function replace(name: string, bytes: Uint8Array) {
    await fs.writeFile(path.join(crops, name), bytes)
    Object.assign(raw.evidence!.artifacts.find(item => item.name === name)!, { sha256: sha256(bytes), byteLength: bytes.byteLength })
  }
  const context = { root, directory: root, runId: evidence.runId } as RunContext
  return { raw, crops, evidence, replace, context }
}

it('宿主从本轮原生侧车与原始PNG重算，并在验收时重复核对语义', async () => {
  const { raw, crops } = await fixture()
  const report = await finalizeNativePixelEffects(raw, crops)
  expect(report.results[0]).toMatchObject({ status: 'supported' })
  expect(raw.results[0]).toMatchObject({ status: 'not-tested' })
  await expect(validateNativePixelEvidence(report, crops)).resolves.toBeUndefined()
  report.results[0]!.status = 'unsupported'
  await expect(validateNativePixelEvidence(report, crops)).rejects.toThrow(/overflow 结论/)
})

it('原始采集不能把截图指纹差异预先写成overflow支持', async () => {
  const { raw, crops } = await fixture()
  raw.results[0]!.status = 'supported'
  await expect(finalizeNativePixelEffects(raw, crops)).rejects.toThrow(/不能预先声明结论/)
})

it.each(['hash', 'run', 'sidecar-source', 'sidecar-bundle', 'missing-sidecar', 'reported-geometry', 'native-geometry', 'same-clipping'])('%s 缺证或篡改必须拒绝形成任何支持结论', async (mode) => {
  const { raw, crops, evidence, replace } = await fixture()
  const name = 'layout-overflow-geometry.json'
  const sidecar = JSON.parse(await fs.readFile(path.join(crops, name), 'utf8'))
  if (mode === 'hash') {
    raw.evidence!.artifacts[0]!.sha256 = 'a'.repeat(64)
  }
  if (mode === 'run') {
    raw.evidence!.artifacts[0]!.runId = createEvidenceContext(new Uint8Array()).runId
  }
  if (mode === 'sidecar-source' || mode === 'sidecar-bundle') {
    if (mode === 'sidecar-source') {
      sidecar.source = 'js-report'
    }
    else {
      sidecar.bundleSha256 = 'b'.repeat(64)
    }
    await replace(name, new TextEncoder().encode(JSON.stringify(sidecar)))
  }
  if (mode === 'missing-sidecar') {
    await fs.rm(path.join(crops, name))
  }
  if (mode === 'reported-geometry') {
    raw.results[0]!.geometry!.probe.left++
  }
  if (mode === 'native-geometry') {
    sidecar.geometry.probe.width = 120
    sidecar.geometry.probe.right = sidecar.geometry.probe.left + 120
    raw.results[0]!.geometry = sidecar.geometry
    await replace(name, new TextEncoder().encode(JSON.stringify(sidecar)))
  }
  if (mode === 'same-clipping') {
    await replace('layout-overflow-geometry-control.png', PNG.sync.write(overflowImage(true, 3)))
  }
  await expect(readOverflowEvidence(raw, crops, evidence)).rejects.toThrow()
})

it('统一adapter重读独立侧车和像素，负向预期与伪造checkpoint均不能跳过效果重算', async () => {
  const { raw, crops, context, replace } = await fixture(false)
  const report = await finalizeNativePixelEffects(raw, crops)
  const contract: CaseContract = { id: 'layout-overflow', features: ['overflow'], candidate: 'overflow-hidden', fixture: '独立双轴越界夹具', expectation: { support: 'unsupported', stage: 'visual' }, requiredAssertions: ['semantic-support'], expectedValues: { 'semantic-support': 'unsupported' } }
  expect(await validateLynxCase(context, report, contract)).toMatchObject({ status: 'passed', assertions: [{ actual: 'unsupported' }] })
  await replace('layout-overflow-geometry-probe.png', PNG.sync.write(overflowImage(true, 3)))
  report.evidence = raw.evidence
  report.results[0]!.checkpoints = [{ name: 'forged-passed', passed: true }]
  expect(await validateLynxCase(context, report, contract)).toMatchObject({ status: 'failed', assertions: [{ actual: 'supported', expected: 'unsupported' }] })
})
