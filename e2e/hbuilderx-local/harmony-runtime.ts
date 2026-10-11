import type { HarmonyDomProbe } from './harmony-dom-probe'
import { spawnSync } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { setTimeout } from 'node:timers/promises'
import { hasHarmonyDomMarker } from './harmony-dom-probe'
import { resolveHdcCommand } from './process'

interface LayoutNode {
  attributes?: { text?: string }
  children?: LayoutNode[]
}

export function hasHarmonyMarker(node: LayoutNode, marker: string): boolean {
  return node.attributes?.text === marker || (node.children ?? []).some(child => hasHarmonyMarker(child, marker))
}

export function assertHarmonyProcessUnchanged(before: string, after: string) {
  if (!/^\d+$/.test(before) || !/^\d+$/.test(after) || before !== after) {
    throw new Error(`Harmony 运行进程未保持：before=${before} after=${after}；不能计作纯 HMR`)
  }
}

/** 同时保存本轮布局和截图；产物命中不能替代设备 marker 与进程连续性。 */
interface HarmonyEvidenceOptions {
  deviceId?: string | undefined
  directory: string
  marker: string
  readDomProbe?: () => HarmonyDomProbe | undefined
}

export async function captureHarmonyRuntimeEvidence(options: HarmonyEvidenceOptions) {
  const hdc = resolveHdcCommand()
  const base = options.deviceId ? ['-t', options.deviceId] : []
  const bundle = process.env['E2E_HARMONY_BUNDLE_ID'] ?? 'io.dcloud.uniappx'
  const run = (...args: string[]) => {
    const result = spawnSync(hdc, [...base, ...args], { encoding: 'utf8', timeout: 15_000 })
    if (result.status !== 0) {
      throw new Error(`Harmony 运行时探针失败：${result.stderr || result.stdout || result.error}`)
    }
    return result.stdout.trim()
  }
  await mkdir(options.directory, { recursive: true })
  const layout = path.join(options.directory, 'layout.json')
  const screenshot = path.join(options.directory, 'screenshot.jpeg')
  // 此处是设备上的逻辑路径，不是宿主机文件系统路径。
  const remote = `/data/local/tmp/weapp-hmr-${process.pid}-${Date.now()}`
  try {
    const pid = run('shell', 'pidof', bundle)
    run('shell', 'uitest', 'dumpLayout', '-p', `${remote}.json`, '-b', bundle)
    run('file', 'recv', `${remote}.json`, layout)
    const root = JSON.parse(await readFile(layout, 'utf8')) as LayoutNode
    run('shell', 'snapshot_display', '-f', `${remote}.jpeg`)
    run('file', 'recv', `${remote}.jpeg`, screenshot)
    const afterPid = run('shell', 'pidof', bundle)
    const dom = options.readDomProbe?.()
    const markerFound = options.readDomProbe
      ? hasHarmonyDomMarker(dom, options.marker)
      : hasHarmonyMarker(root, options.marker)
    const evidence = { pid, afterPid, layout, screenshot, marker: options.marker, markerFound, ...(dom ? { dom } : {}) }
    await writeFile(path.join(options.directory, 'state.json'), `${JSON.stringify(evidence, null, 2)}\n`)
    return evidence
  }
  finally {
    spawnSync(hdc, [...base, 'shell', 'rm', '-f', `${remote}.json`, `${remote}.jpeg`], { timeout: 15_000 })
  }
}

export async function waitForHarmonyRuntimeEvidence(options: HarmonyEvidenceOptions & {
  previousPid?: string
  timeoutMs: number
  ensureRunning: () => void
}) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < options.timeoutMs) {
    options.ensureRunning()
    const evidence = await captureHarmonyRuntimeEvidence(options)
    await setTimeout(0)
    options.ensureRunning()
    assertHarmonyProcessUnchanged(evidence.pid, evidence.afterPid)
    if (options.previousPid) {
      assertHarmonyProcessUnchanged(options.previousPid, evidence.pid)
    }
    if (evidence.markerFound) {
      return evidence
    }
    await setTimeout(100)
  }
  throw new Error(`Harmony 产物已更新，但设备未出现当前 marker：${options.marker}\n证据：${options.directory}`)
}
