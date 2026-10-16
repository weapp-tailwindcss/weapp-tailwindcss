import type { ChildProcess } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { createInterface } from 'node:readline'
import { injectRuntimeStructureProbe } from './inject'

export type RuntimeStructureAdapter = 'uni-app-renderjs' | 'uni-app-x-element'

export interface RuntimeStructureNode {
  id: string
  tagName: string
  text: string
  rect: { left: number, top: number, width: number, height: number }
}

export interface RuntimeStructureSample {
  schemaVersion: 1
  runId: string
  adapter: RuntimeStructureAdapter
  sequence: number
  instanceId: string
  token: string
  pixelRatio: number
  markerCount: number
  marker: RuntimeStructureNode
  nodes: RuntimeStructureNode[]
}

export interface RuntimeStructureReceipt {
  sample: RuntimeStructureSample
  ordinal: number
  receivedAt: string
}

export interface RuntimeStructureExpectation {
  runId: string
  step: string
  markerText: string
  token: string
  transfer?: string
  read: () => RuntimeStructureReceipt | undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isNode(value: unknown): value is RuntimeStructureNode {
  if (!isRecord(value) || !isRecord(value.rect)) {
    return false
  }
  const rect = value.rect
  return typeof value.id === 'string' && typeof value.tagName === 'string' && value.tagName.length > 0
    && typeof value.text === 'string'
    && ['left', 'top', 'width', 'height'].every(key => typeof rect[key] === 'number' && Number.isFinite(rect[key]))
    && Number(rect.width) >= 0 && Number(rect.height) >= 0
}

/** 只解析当前探针的完整行；设备日志后缀不属于 JSON。 */
export function readRuntimeStructureSample(line: string, runId: string): RuntimeStructureSample | undefined {
  const prefix = `WT_RUNTIME_STRUCTURE_${runId}=`
  const start = line.indexOf(prefix)
  if (start < 0) {
    return
  }
  const fragment = line.slice(start + prefix.length)
  let depth = 0
  let quoted = false
  let escaped = false
  let end = -1
  for (let index = 0; index < fragment.length; index++) {
    const char = fragment[index]
    if (quoted) {
      if (escaped) {
        escaped = false
      }
      else if (char === '\\') {
        escaped = true
      }
      else if (char === '"') {
        quoted = false
      }
    }
    else if (char === '"') {
      quoted = true
    }
    else if (char === '{') {
      depth++
    }
    else if (char === '}' && --depth === 0) {
      end = index + 1
      break
    }
  }
  let value: unknown
  try {
    value = JSON.parse(fragment.slice(0, end < 0 ? undefined : end))
  }
  catch (error) {
    throw new TypeError('运行时结构探针返回了无效 JSON', { cause: error })
  }
  if (!isRecord(value) || value.runId !== runId) {
    throw new TypeError('运行时结构探针的本轮身份不匹配')
  }
  if (typeof value.error === 'string') {
    throw new TypeError(`运行时结构探针失败：${value.error}`)
  }
  if (value.schemaVersion !== 1 || !['uni-app-renderjs', 'uni-app-x-element'].includes(String(value.adapter))
    || !Number.isSafeInteger(value.sequence) || Number(value.sequence) < 1
    || typeof value.instanceId !== 'string' || !value.instanceId
    || typeof value.token !== 'string'
    || typeof value.pixelRatio !== 'number' || !Number.isFinite(value.pixelRatio) || value.pixelRatio <= 0
    || !Number.isSafeInteger(value.markerCount) || Number(value.markerCount) < 0
    || !isNode(value.marker) || !Array.isArray(value.nodes) || !value.nodes.every(isNode)) {
    throw new TypeError('运行时结构探针返回了不完整的节点或布局数据')
  }
  return value as unknown as RuntimeStructureSample
}

export function hasRuntimeStructureMarker(sample: RuntimeStructureSample | undefined, runId: string, markerText: string, token: string) {
  return sample?.runId === runId && sample.markerCount === 1 && sample.marker.id === 'native-hmr-probe'
    && sample.token === token
    && sample.marker.text === markerText && sample.marker.rect.width > 0 && sample.marker.rect.height > 0
    && sample.nodes.some(node => node.id === sample.marker.id && node.text === sample.marker.text
      && ['left', 'top', 'width', 'height'].every(key => node.rect[key as keyof typeof node.rect] === sample.marker.rect[key as keyof typeof node.rect]))
}

/** 接收序号由宿主递增；reload 重建模块时，设备自己的计数可以重新开始。 */
export function observeRuntimeStructure(child: Pick<ChildProcess, 'stdout' | 'stderr'>, runId: string, adapter: RuntimeStructureAdapter) {
  let latest: RuntimeStructureReceipt | undefined
  let failure: unknown
  let ordinal = 0
  const sequences = new Map<string, number>()
  const readers = [child.stdout, child.stderr].flatMap(stream => stream ? [createInterface({ input: stream })] : [])
  for (const reader of readers) {
    reader.on('line', (line) => {
      try {
        const sample = readRuntimeStructureSample(line, runId)
        if (sample) {
          if (sample.adapter !== adapter) {
            throw new Error('运行时结构探针适配器与启动目标不匹配')
          }
          if (sample.sequence <= (sequences.get(sample.instanceId) ?? 0)) {
            return
          }
          sequences.set(sample.instanceId, sample.sequence)
          latest = { sample, ordinal: ++ordinal, receivedAt: new Date().toISOString() }
        }
      }
      catch (error) {
        failure ??= error
      }
    })
  }
  return {
    read() {
      if (failure) {
        throw failure
      }
      return latest
    },
    dispose() {
      readers.forEach(reader => reader.close())
    },
  }
}

export function createRuntimeStructureProbe(sourceFile: string) {
  const runId = randomUUID()
  const adapter = /\.uvue$/i.test(sourceFile) ? 'uni-app-x-element' : 'uni-app-renderjs'
  return {
    runId,
    nextToken: () => randomUUID(),
    inject: (source: string) => injectRuntimeStructureProbe(source, runId, adapter),
    observe: (child: Pick<ChildProcess, 'stdout' | 'stderr'>) => observeRuntimeStructure(child, runId, adapter),
  }
}
