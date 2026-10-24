import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { limits } from '../scripts/diagnostics/constants.mjs'
import { createEvidenceWriter, sha256 } from '../scripts/diagnostics/evidence.mjs'
import { compareOperationInputs, verifyOperationEvidence } from '../scripts/diagnostics/operation-evidence.mjs'
import { createOperationRecorder } from '../scripts/diagnostics/operations.mjs'

const roots = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => fs.rm(root, { recursive: true, force: true })))
})

async function directory() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mpx-operation-evidence-'))
  roots.push(root)
  return root
}

async function fixture() {
  const root = await directory()
  const writer = createEvidenceWriter(root)
  const recorder = createOperationRecorder({ root, writer, phase: () => ({ type: 'build-start' }) })
  recorder.emit('webpack.created')
  recorder.source(path.join(root, 'source.mpx'), '<view class="flex"/>')
  for (const name of ['generator.generate', 'native.create', 'native.generate', 'engine.compile', 'engine.build']) {
    recorder.sync(name, {}, () => undefined)
  }
  recorder.emit('webpack.completed')
  const status = () => ({ ...writer.accounting(), operations: recorder.summary(), webpackCreatedCount: 1, webpackCompletedCount: 1, snapshotCount: 1 })
  return { root, recorder, status }
}

function controller(root, platform, details, extra = []) {
  const inputs = [{ name: 'native.generate.start', phase: { type: 'mutation-write', round: 3 }, details }, ...extra]
  return { identity: { root, platform }, operationEvidence: { inputs, inputFiles: inputs.map((_, index) => `operation-${index + 1}.json`) } }
}

describe('Mpx 操作完整性与跨工程比较', () => {
  it.each([
    ['/base/project', '/head/project', 'linux'],
    ['C:\\base\\project', 'D:\\head\\project', 'win32'],
    ['/', '/project', 'linux'],
    ['C:\\', 'D:\\head', 'win32'],
  ])('仅结构化路径按已知根归一化：%s', (before, after, platform) => {
    const paths = platform === 'win32' ? path.win32 : path.posix
    const details = root => ({ source: { base: root, dependencies: [paths.join(root, 'src', 'main.css'), 'relative.css'], css: { text: { sha256: sha256('a{}') } } }, request: { candidates: ['flex'] }, sessionId: root === before ? 1 : 7 })
    expect(compareOperationInputs(controller(before, platform, details(before)), controller(after, platform, details(after))).sameRecordedOperationsAndInputs).toBe(true)
    const differentContent = details(after)
    differentContent.source.css.text.sha256 = sha256(`/* ${after} */a{}`)
    expect(compareOperationInputs(controller(before, platform, details(before)), controller(after, platform, differentContent)).sameRecordedOperationsAndInputs).toBe(false)
  })

  it('完整文本、候选、调用次数或顺序不同均保留工件定位，不透明引用不能宣称相等', () => {
    const base = controller('/base', 'linux', { candidates: ['flex'] })
    const current = controller('/current', 'linux', { candidates: ['flex', 'grid'] })
    expect(compareOperationInputs(base, current)).toMatchObject({ sameRecordedOperationsAndInputs: false, differences: [{ index: 0, baselineFile: 'operation-1.json', currentFile: 'operation-1.json' }] })
    const repeated = controller('/current', 'linux', { candidates: ['flex'] }, base.operationEvidence.inputs)
    expect(compareOperationInputs(base, repeated)).toMatchObject({ sameRecordedOperationsAndInputs: false, baselineCount: 1, currentCount: 2 })
    const opaque = { reference: 1, comparableAcrossWorkers: false }
    expect(compareOperationInputs(controller('/base', 'linux', opaque), controller('/current', 'linux', opaque))).toMatchObject({ sameRecordedOperationsAndInputs: false, opaqueInputs: true })
    const ordered = controller('/base', 'linux', { candidates: ['flex'] }, [{ ...base.operationEvidence.inputs[0], details: { candidates: ['grid'] } }])
    const reversed = structuredClone(ordered)
    reversed.operationEvidence.inputs.reverse()
    expect(compareOperationInputs(ordered, reversed).sameRecordedOperationsAndInputs).toBe(false)
  })

  it('完整文件、全文引用和操作配对通过，尾部缺失、重复完成及未对应完成失败', async () => {
    const { root, recorder, status } = await fixture()
    await expect(verifyOperationEvidence(root, status())).resolves.toMatchObject({ webpackCreated: 1, webpackCompleted: 1, textFiles: 1 })
    const operationId = recorder.emit('native.dispose.start')
    await expect(verifyOperationEvidence(root, status())).rejects.toThrow('缺少完成')
    recorder.emit('native.dispose.success', { operationId })
    await expect(verifyOperationEvidence(root, status())).resolves.toBeDefined()
    recorder.emit('native.dispose.success', { operationId })
    await expect(verifyOperationEvidence(root, status())).rejects.toThrow('对应开始或重复完成')
  })

  it('逐文件统计不信任最后状态，丢失和会话总量超限都失败', async () => {
    const first = await fixture()
    const status = first.status()
    await fs.unlink(path.join(first.root, 'operation-1.json'))
    await expect(verifyOperationEvidence(first.root, status)).rejects.toThrow('总量与最后状态不一致')
    const root = await directory()
    for (let index = 1; index <= 5; index++) {
      const file = await fs.open(path.join(root, `operation-${index}.json`), 'w')
      try {
        await file.truncate(limits.maxProfileBytes)
      }
      finally {
        await file.close()
      }
    }
    await expect(verifyOperationEvidence(root, {})).rejects.toThrow('会话总量上限')
  })
})
