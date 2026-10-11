import type { HarmonyRuntimeTextPair } from '../../e2e/hbuilderx-local/cases.ts'
import type { HarmonyDomProbe } from '../../e2e/hbuilderx-local/harmony-dom-probe.ts'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs/promises'
import process from 'node:process'
import { resolveHdcCommand } from '../../e2e/hbuilderx-local/process.ts'

interface HarmonyLayoutNode {
  attributes?: {
    bounds?: string
    text?: string
    type?: string
  }
  children?: HarmonyLayoutNode[]
}

interface HarmonyLayoutBounds {
  height: number
  maxX: number
  maxY: number
  minX: number
  minY: number
  width: number
}

function normalizeLayoutText(value: string | undefined) {
  return value?.replace(/\s+/g, ' ').trim() ?? ''
}

export function parseHarmonyLayoutBounds(value: string | undefined): HarmonyLayoutBounds | undefined {
  const match = value?.match(/^\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]$/)
  if (!match) {
    return undefined
  }
  const [, minXSource, minYSource, maxXSource, maxYSource] = match
  const minX = Number(minXSource)
  const minY = Number(minYSource)
  const maxX = Number(maxXSource)
  const maxY = Number(maxYSource)
  return {
    height: maxY - minY,
    maxX,
    maxY,
    minX,
    minY,
    width: maxX - minX,
  }
}

function collectHarmonyLayoutNodes(root: HarmonyLayoutNode) {
  const nodes: HarmonyLayoutNode[] = []
  const visit = (node: HarmonyLayoutNode) => {
    nodes.push(node)
    node.children?.forEach(visit)
  }
  visit(root)
  return nodes
}

export function analyzeHarmonyRuntimeTextPairs(root: HarmonyLayoutNode, pairs: HarmonyRuntimeTextPair[]) {
  const nodes = collectHarmonyLayoutNodes(root)
  return pairs.map((pair) => {
    const tailwindNode = nodes.find(node => normalizeLayoutText(node.attributes?.text) === normalizeLayoutText(pair.tailwindText))
      ?? (pair.tailwindLayoutNodeIndex == null ? undefined : nodes[pair.tailwindLayoutNodeIndex])
    const nativeNode = nodes.find(node => normalizeLayoutText(node.attributes?.text) === normalizeLayoutText(pair.nativeText))
      ?? (pair.nativeLayoutNodeIndex == null ? undefined : nodes[pair.nativeLayoutNodeIndex])
    const tailwindBounds = parseHarmonyLayoutBounds(tailwindNode?.attributes?.bounds)
    const nativeBounds = parseHarmonyLayoutBounds(nativeNode?.attributes?.bounds)
    if (!tailwindBounds || !nativeBounds) {
      throw new Error(`Harmony 布局树缺少 line-height 对照节点：tailwind=${pair.tailwindText} native=${pair.nativeText}`)
    }
    const maxHeightDifference = pair.maxHeightDifference ?? 1
    const heightDifference = Math.abs(tailwindBounds.height - nativeBounds.height)
    if (heightDifference > maxHeightDifference) {
      throw new Error(`Harmony line-height 对照高度不一致：tailwind=${tailwindBounds.height}px native=${nativeBounds.height}px diff=${heightDifference}px`)
    }
    return {
      heightDifference,
      native: {
        bounds: nativeBounds,
        text: normalizeLayoutText(nativeNode?.attributes?.text),
        type: nativeNode?.attributes?.type,
      },
      tailwind: {
        bounds: tailwindBounds,
        text: normalizeLayoutText(tailwindNode?.attributes?.text),
        type: tailwindNode?.attributes?.type,
      },
    }
  })
}

/** DOM API 返回逻辑像素；换算为设备像素后使用同一视觉误差门槛。 */
export function analyzeHarmonyDomTextPairs(probe: HarmonyDomProbe, pairs: HarmonyRuntimeTextPair[]) {
  const resolveNode = (text: string) => {
    const matches = probe.nodes.filter(node => normalizeLayoutText(node.text) === normalizeLayoutText(text))
    const node = matches.length === 1 ? matches[0] : undefined
    if (!node || node.rect.width <= 0 || node.rect.height <= 0) {
      throw new Error(`Harmony DOM 缺少唯一且已布局的 line-height 对照节点：${text}`)
    }
    const { left, top, width, height } = node.rect
    const scale = probe.pixelRatio
    return {
      bounds: { minX: left * scale, minY: top * scale, maxX: (left + width) * scale, maxY: (top + height) * scale, width: width * scale, height: height * scale },
      text: normalizeLayoutText(node.text),
      type: node.tagName,
    }
  }
  return pairs.map((pair) => {
    const tailwind = resolveNode(pair.tailwindText)
    const native = resolveNode(pair.nativeText)
    const heightDifference = Math.abs(tailwind.bounds.height - native.bounds.height)
    if (heightDifference > (pair.maxHeightDifference ?? 1)) {
      throw new Error(`Harmony line-height 对照高度不一致：tailwind=${tailwind.bounds.height}px native=${native.bounds.height}px diff=${heightDifference}px`)
    }
    return { heightDifference, native, tailwind }
  })
}

function createHdcArgs(deviceId?: string) {
  return deviceId ? ['-t', deviceId] : []
}

export async function captureAndAnalyzeHarmonyLayout(options: {
  deviceId?: string
  file: string
  pairs: HarmonyRuntimeTextPair[]
  timeoutMs: number
}) {
  const hdc = resolveHdcCommand()
  const baseArgs = createHdcArgs(options.deviceId)
  const remote = `/data/local/tmp/weapp-tailwindcss-layout-${process.pid}-${Date.now()}.json`
  const dump = spawnSync(hdc, [...baseArgs, 'shell', 'uitest', 'dumpLayout', '-p', remote, '-b', 'io.dcloud.uniappx'], {
    encoding: 'utf8',
    killSignal: 'SIGTERM',
    timeout: options.timeoutMs,
  })
  if (dump.status !== 0) {
    throw new Error(`Harmony 布局树采集失败：${dump.stderr || dump.stdout || `exit=${dump.status}`}`)
  }
  const receive = spawnSync(hdc, [...baseArgs, 'file', 'recv', remote, options.file], {
    encoding: 'utf8',
    killSignal: 'SIGTERM',
    timeout: options.timeoutMs,
  })
  spawnSync(hdc, [...baseArgs, 'shell', 'rm', '-f', remote], {
    encoding: 'utf8',
    killSignal: 'SIGTERM',
    timeout: options.timeoutMs,
  })
  if (receive.status !== 0) {
    throw new Error(`Harmony 布局树拉取失败：${receive.stderr || receive.stdout || `exit=${receive.status}`}`)
  }
  const root = JSON.parse(await fs.readFile(options.file, 'utf8')) as HarmonyLayoutNode
  return {
    file: options.file,
    pairs: analyzeHarmonyRuntimeTextPairs(root, options.pairs),
  }
}
