import type { ChildProcess } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { createInterface } from 'node:readline'

export interface HarmonyDomNode {
  id: string
  tagName: string
  text: string
  rect: { left: number, top: number, width: number, height: number }
}

export interface HarmonyDomProbe {
  runId: string
  pixelRatio: number
  marker: HarmonyDomNode
  nodes: HarmonyDomNode[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isDomNode(value: unknown): value is HarmonyDomNode {
  if (!isRecord(value) || !isRecord(value.rect)) {
    return false
  }
  const rect = value.rect
  return typeof value.id === 'string'
    && typeof value.tagName === 'string'
    && typeof value.text === 'string'
    && ['left', 'top', 'width', 'height'].every(key => typeof rect[key] === 'number' && Number.isFinite(rect[key]))
    && Number(rect.width) >= 0
    && Number(rect.height) >= 0
}

export function hasHarmonyDomMarker(probe: HarmonyDomProbe | undefined, marker: string) {
  return probe?.marker.text === marker && probe.marker.rect.width > 0 && probe.marker.rect.height > 0
}

/** 只读取本轮真实 DOM API 的结果；缺失结果不能由无文字的可访问性树代替。 */
export function readHarmonyDomProbe(log: string, runId: string): HarmonyDomProbe | undefined {
  const prefix = `WT_HARMONY_DOM_${runId}=`
  for (const line of log.split(/\r?\n/).reverse()) {
    const start = line.indexOf(prefix)
    if (start < 0) {
      continue
    }
    const fragment = line.slice(start + prefix.length).trim()
    let value: unknown
    try {
      value = JSON.parse(fragment.slice(0, fragment.lastIndexOf('}') + 1))
    }
    catch {
      continue
    }
    if (!isRecord(value) || value.runId !== runId) {
      continue
    }
    if (typeof value.error === 'string') {
      throw new TypeError(`Harmony DOM 运行时探针失败：${value.error}`)
    }
    if (typeof value.pixelRatio !== 'number' || !Number.isFinite(value.pixelRatio) || value.pixelRatio <= 0
      || !isDomNode(value.marker) || !Array.isArray(value.nodes) || !value.nodes.every(isDomNode)) {
      throw new TypeError('Harmony DOM 运行时探针返回了不完整的节点或布局数据')
    }
    return { runId, pixelRatio: value.pixelRatio, marker: value.marker, nodes: value.nodes }
  }
}

/** 在测试管理的 script setup 中临时安装探针，卸载时释放定时器。 */
export function injectHarmonyDomProbe(source: string, runId: string) {
  const script = /(<script\b[^>]*>)([\s\S]*?)(<\/script\s*>)/gi
  const match = [...source.matchAll(script)].find(item => /\ssetup(?=[\s>])/i.test(item[1] ?? ''))
  if (!match) {
    throw new Error('Harmony DOM 探针需要测试项目提供 script setup')
  }
  const prefix = JSON.stringify(`WT_HARMONY_DOM_${runId}=`)
  const nonce = JSON.stringify(runId)
  const probe = `
import { onUnmounted as __wtDomProbeUnmounted } from 'vue'
function __wtDomProbeNode(element: UniElement): UTSJSONObject {
  const rect = element.getBoundingClientRect()
  let text = ''
  if (element.tagName.toLowerCase() == 'text') {
    text = (element as UniTextElement).value
  } else {
    const texts = element.querySelectorAll('text')
    for (const node of texts) {
      text += (node as UniTextElement).value
    }
  }
  return { id: element.getAttribute('id') ?? '', tagName: element.tagName, text, rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height } }
}
let __wtDomProbeLast = ''
const __wtDomProbeTimer = setInterval(() => {
  try {
    const marker = uni.getElementById('native-hmr-probe')
    if (marker == null) return
    const parent = marker.parentElement ?? marker
    const nodes = [] as UTSJSONObject[]
    for (const node of parent.querySelectorAll('text')) {
      nodes.push(__wtDomProbeNode(node))
    }
    const payload = JSON.stringify({ runId: ${nonce}, pixelRatio: uni.getWindowInfo().pixelRatio, marker: __wtDomProbeNode(marker), nodes })
    if (payload != __wtDomProbeLast) {
      __wtDomProbeLast = payload
      console.log(${prefix} + payload)
    }
  } catch (error) {
    console.log(${prefix} + JSON.stringify({ runId: ${nonce}, error: String(error) }))
  }
}, 250)
__wtDomProbeUnmounted(() => { clearInterval(__wtDomProbeTimer) })
`
  const [, open, body, close] = match
  return `${source.slice(0, match.index)}${open}${probe}${body}${close}${source.slice(match.index + match[0].length)}`
}

export function createHarmonyDomProbe() {
  const runId = randomUUID()
  return {
    runId,
    inject: (source: string) => injectHarmonyDomProbe(source, runId),
    read: (log: string) => readHarmonyDomProbe(log, runId),
    observe: (child: Pick<ChildProcess, 'stdout' | 'stderr'>) => observeHarmonyDomProbe(child, runId),
  }
}

/** 按流拼接完整消息并保存最近的结构证据，系统日志刷屏不会抹掉已接收的本轮状态。 */
export function observeHarmonyDomProbe(child: Pick<ChildProcess, 'stdout' | 'stderr'>, runId: string) {
  let report: HarmonyDomProbe | undefined
  let failure: unknown
  const readers = [child.stdout, child.stderr].flatMap(stream => stream ? [createInterface({ input: stream })] : [])
  for (const reader of readers) {
    reader.on('line', (line) => {
      try {
        const next = readHarmonyDomProbe(line, runId)
        if (next) {
          report = next
        }
      }
      catch (error) {
        failure = error
      }
    })
  }
  return {
    read() {
      if (failure) {
        throw failure
      }
      return report
    },
    dispose() {
      readers.forEach(reader => reader.close())
    },
  }
}
