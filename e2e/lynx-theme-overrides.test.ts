import type { NativePlatformReport } from '../examples/react-lynx/src/compatibility/types'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { themeOverrideArtifacts } from './lynx/fixtures/theme-overrides'
import iosReport from './lynx/reports/ios.json'
import { validateThemeOverrideArtifacts } from './lynx/theme-overrides'

const context = { version: 1 as const, runId: 'cde33333-3333-4333-8333-333333333333', bundleSha256: 'a'.repeat(64) }
const directories: string[] = []

afterEach(async () => {
  await Promise.all(directories.splice(0).map(directory => fs.rm(directory, { recursive: true, force: true })))
})

async function fixture(mutate?: (report: NativePlatformReport) => void, pixel?: { branch: string, phase: string, rgb: number[] }) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'lynx-theme-'))
  directories.push(directory)
  const report = structuredClone(iosReport) as NativePlatformReport
  report.environment.viewport.pixelRatio = 2
  report.evidence = { ...context, artifacts: [] }
  for (const [name, bytes] of themeOverrideArtifacts(report, pixel)) {
    await fs.writeFile(path.join(directory, name), bytes)
  }
  mutate?.(report)
  return { report, directory }
}

it('三分支的切换前、后及恢复，分别重读宿主侧车和实色 PNG', async () => {
  const { report, directory } = await fixture()
  await expect(validateThemeOverrideArtifacts(report, directory, context)).resolves.toBeUndefined()
})

it.each([
  ['缺主题证据', (report: NativePlatformReport) => { delete report.themeOverrides }],
  ['缺恢复帧', (report: NativePlatformReport) => { report.themeOverrides!.frames.pop() }],
  ['重复 ID', (report: NativePlatformReport) => { report.themeOverrides!.frames[1]!.id = report.themeOverrides!.frames[0]!.id }],
  ['旧合同', (report: NativePlatformReport) => { report.themeOverrides!.contract = 'old' }],
  ['伪造测量', (report: NativePlatformReport) => { report.themeOverrides!.frames[0]!.geometry.probe.width = 60 }],
  ['旧回执', (report: NativePlatformReport) => { report.evidence!.artifacts[0]!.runId = 'old' }],
  ['旧 bundle', (report: NativePlatformReport) => { report.evidence!.bundleSha256 = 'b'.repeat(64) }],
] as const)('%s 不能自报成功', async (_name, mutate) => {
  const { report, directory } = await fixture(mutate)
  await expect(validateThemeOverrideArtifacts(report, directory, context)).rejects.toThrow()
})

it.each(['before', 'after', 'restored'])('%s 的节点可见但颜色错误仍拒绝', async (phase) => {
  const { report, directory } = await fixture(undefined, { branch: 'application-oklch', phase, rgb: [255, 255, 255] })
  await expect(validateThemeOverrideArtifacts(report, directory, context)).rejects.toThrow(/主题.*像素/)
})

it('第二帧沿用首次颜色，即使全部节点与回执存在也拒绝', async () => {
  const { report, directory } = await fixture(undefined, { branch: 'tailwind-hex', phase: 'after', rgb: [255, 0, 0] })
  await expect(validateThemeOverrideArtifacts(report, directory, context)).rejects.toThrow(/主题.*像素/)
})
