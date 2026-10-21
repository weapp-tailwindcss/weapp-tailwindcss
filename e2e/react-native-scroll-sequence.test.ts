import type { NativeCaseReceipt, ReactNativeReport } from '../examples/react-native-expo/src/compatibility/protocol'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { PNG } from 'pngjs'
import { expect, it } from 'vitest'
import { androidPairCoordinates } from './react-native/android-window'
import { syntheticRuntimeInstallation } from './react-native/installation-fixture'
import { captureNativePair, validateNativeArtifacts } from './react-native/pair-evidence'
import { syntheticScrollPair } from './react-native/scroll-fixture'
import { assertScrollTransition } from './react-native/scroll-sequence'

const identity = { runId: 'run', revision: 'baseline', platform: 'web' as const, id: 'sizing-size', runtimeInstallation: syntheticRuntimeInstallation() }
const phases = ['scroll-initial', 'scroll-offset', 'scroll-restored'] as const
const pair = (index: number) => syntheticScrollPair({ ...structuredClone(identity), phase: phases[index]! }).pair

it.each(['missing', 'duplicate', 'order', 'mount', 'event', 'history', 'run', 'installation'] as const)('跨phase拒绝 %s，不以单帧像素通过替代三步连续性', (mutation) => {
  const previous = pair(mutation === 'history' ? 1 : 0)
  const current = pair(mutation === 'history' ? 2 : 1)
  if (mutation === 'missing') {
    return expect(() => assertScrollTransition(current)).toThrow(/ScrollView/)
  }
  if (mutation === 'duplicate') {
    return expect(() => assertScrollTransition(previous, previous)).toThrow(/ScrollView/)
  }
  if (mutation === 'order') {
    return expect(() => assertScrollTransition(pair(2), previous)).toThrow(/ScrollView/)
  }
  if (mutation === 'mount') {
    current.scroll!.sides[0]!.mountId = 'new-mount'
  }
  if (mutation === 'event') {
    previous.scroll!.sides[0]!.event = { ...current.scroll!.sides[0]!.event! }
  }
  if (mutation === 'history') {
    current.scroll!.sides[0]!.history[0]!.event.sequence = 77
  }
  if (mutation === 'run') {
    current.runId = 'other-run'
  }
  if (mutation === 'installation') {
    current.runtimeInstallation.runtimeInstanceId = 'new-instance'
  }
  expect(() => assertScrollTransition(current, previous)).toThrow(/ScrollView/)
})

it('离线重读三步成功原件与全部PNG；缺步、换挂载、删除事件及历史改写均拒绝', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'rn-scroll-replay-'))
  try {
    const receipts: NativeCaseReceipt[] = []
    for (const phase of phases) {
      const input = syntheticScrollPair({ ...identity, phase })
      receipts.push(await captureNativePair(input.pair, { runId: identity.runId, artifacts: directory, capture: async (name) => {
        const file = path.join(directory, name)
        await fs.writeFile(file, PNG.sync.write(input.image))
        return file
      } }))
    }
    const report = { ...identity, receipts } as unknown as ReactNativeReport
    await expect(validateNativeArtifacts(report, directory)).resolves.toBeUndefined()
    for (const missing of [0, 1, 2]) {
      await expect(validateNativeArtifacts({ ...report, receipts: receipts.filter((_, index) => index !== missing) }, directory)).rejects.toThrow(/ScrollView/)
    }
    for (const mutation of ['mount', 'event', 'history']) {
      const file = path.join(directory, `${receipts[2]!.artifact.name}.json`)
      const original = await fs.readFile(file, 'utf8')
      const saved = JSON.parse(original)
      if (mutation === 'mount') {
        saved.pair.scroll.sides[0].mountId = 'replacement'
      }
      if (mutation === 'event') {
        delete saved.pair.scroll.sides[0].event
      }
      if (mutation === 'history') {
        saved.pair.scroll.sides[0].history[0].event.sequence = 77
      }
      await fs.writeFile(file, JSON.stringify(saved))
      await expect(validateNativeArtifacts(report, directory)).rejects.toThrow(/ScrollView|semantics/)
      await fs.writeFile(file, original)
    }
  }
  finally { await fs.rm(directory, { recursive: true, force: true }) }
})

it('Android按同侧真实inset平移首条内容，保留原窗口坐标和事件值不变', () => {
  const input = pair(1)
  const before = structuredClone(input)
  const xml = (['probe', 'reference', 'control'] as const).map((side, index) => {
    const rect = input[side]
    const dx = 5 + index
    const dy = 24 + index
    return `<node package="com.weapptailwindcss.rncompat" resource-id="tw-rn-case-${side}" content-desc="${input.id}:${input.phase}" bounds="[${rect.x + dx},${rect.y + dy}][${rect.x + dx + rect.width},${rect.y + dy + rect.height}]" />`
  }).join('')
  const adjusted = androidPairCoordinates(xml, input)
  for (const [index, side] of adjusted.scroll!.sides.entries()) {
    expect(side.firstStripe.x).toBe(input.scroll!.sides[index]!.firstStripe.x + 5 + index)
    expect(side.firstStripe.y).toBe(input.scroll!.sides[index]!.firstStripe.y + 24 + index)
    expect(side.event).toEqual(input.scroll!.sides[index]!.event)
  }
  expect(input).toEqual(before)
})
