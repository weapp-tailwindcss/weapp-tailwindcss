import type { ResponsiveFrame } from '../examples/react-lynx/src/compatibility/responsive-contract'
import type { NativePlatformReport } from '../examples/react-lynx/src/compatibility/types'
import type { RunContext } from './tailwind-capabilities/context'
import type { CaseContract } from './tailwind-capabilities/types'
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { responsiveArtifactFixture } from './lynx/fixtures/responsive-artifacts'
import { readResponsiveEvidence } from './lynx/responsive-evidence'
import { validateLynxCase } from './tailwind-capabilities/lynx/validate'

const directories: string[] = []
afterEach(async () => {
  await Promise.all(directories.splice(0).map(directory => fs.rm(directory, { recursive: true, force: true })))
})

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'lynx-responsive-evidence-'))
  directories.push(root)
  const context: RunContext = { root, directory: root, runId: '00000000-0000-4000-8000-000000000001' }
  const report = { platform: 'ios', results: [{ id: 'variant-responsive', checkpoints: [] }], environment: { viewport: { width: 390, height: 800, pixelRatio: 2 } }, evidence: { version: 1, runId: context.runId, bundleSha256: 'a'.repeat(64), artifacts: [] } } as unknown as NativePlatformReport
  const directory = path.join(root, 'native', 'crops', context.runId)
  await fs.mkdir(directory, { recursive: true })
  const files = responsiveArtifactFixture(report)
  for (const [name, data] of files) {
    await fs.writeFile(path.join(directory, name), data)
  }
  const rewrite = async (name: string, change: (value: { platform: string, bundleSha256: string, frame: ResponsiveFrame }) => void) => {
    const value = JSON.parse(await fs.readFile(path.join(directory, name), 'utf8'))
    change(value)
    const bytes = JSON.stringify(value)
    await fs.writeFile(path.join(directory, name), bytes)
    Object.assign(report.evidence!.artifacts.find(item => item.name === name)!, { sha256: createHash('sha256').update(bytes).digest('hex'), byteLength: Buffer.byteLength(bytes) })
  }
  return { report, context, directory, rewrite }
}

it('离线重读全部12个原生产物并独立计算，统一adapter沿用相同判定器', async () => {
  const { report, context, directory } = await fixture()
  const { measured } = await readResponsiveEvidence(report, directory, report.evidence!)
  expect(measured.status).toBe('supported')
  Object.assign(report.results[0]!, measured)
  const contract = { id: 'variant-responsive', expectation: { support: 'supported', stage: 'runtime' } } as CaseContract
  expect(await validateLynxCase(context, report, contract)).toMatchObject({ status: 'passed', assertions: [{ stage: 'runtime', actual: 'supported', expected: 'supported' }] })
  // 仅改 checkpoint 无法改变独立判定；删除宿主证据后即使保持通过布尔也必须拒绝。
  report.results[0]!.checkpoints = [{ name: 'forged', passed: true }]
  await fs.rm(path.join(directory, 'variant-responsive-wide.native.json'))
  await expect(validateLynxCase(context, report, contract)).rejects.toThrow()
})

it.each(['old-run', 'old-bundle', 'wrong-platform', 'report-only', 'sidecar-only', 'unreceipted', 'tampered-png', 'missing-restore', 'wrong-root', 'adaptive-rem'] as const)('拒绝 %s；同步伪造新hash也不能覆盖独立身份或尺寸合同', async (mode) => {
  const { report, directory, rewrite } = await fixture()
  const name = 'variant-responsive-wide.native.json'
  if (mode === 'old-run') {
    await rewrite(name, value => value.frame.runId = 'old-run')
  }
  if (mode === 'old-bundle') {
    await rewrite(name, value => value.bundleSha256 = 'b'.repeat(64))
  }
  if (mode === 'wrong-platform') {
    await rewrite(name, value => value.platform = 'android')
  }
  if (mode === 'report-only') {
    report.results[0]!.responsive!.wide.viewport.width = 2000
  }
  if (mode === 'sidecar-only') {
    await rewrite(name, value => value.frame.viewport.width = 2000)
  }
  if (mode === 'unreceipted') {
    report.evidence!.artifacts.pop()
  }
  if (mode === 'tampered-png') {
    await fs.copyFile(path.join(directory, 'variant-responsive-narrow-probe.png'), path.join(directory, 'variant-responsive-wide-probe.png'))
  }
  if (mode === 'missing-restore') {
    await fs.rm(path.join(directory, 'variant-responsive-restored-probe.png'))
  }
  if (mode === 'wrong-root' || mode === 'adaptive-rem') {
    await rewrite(name, (value) => {
      if (mode === 'wrong-root') {
        value.frame.viewport.width = value.frame.viewport.measuredWidth = 384
      }
      else {
        value.frame.threshold.width = value.frame.threshold.right = 1920
      }
      report.results[0]!.responsive!.wide = value.frame
    })
  }
  await expect(readResponsiveEvidence(report, directory, report.evidence!)).rejects.toThrow()
})
