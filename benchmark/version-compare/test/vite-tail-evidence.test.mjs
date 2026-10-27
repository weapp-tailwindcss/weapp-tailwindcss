import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createEvidenceWriter } from '../scripts/diagnostics/evidence.mjs'
import { createOperationRecorder } from '../scripts/diagnostics/operations.mjs'
import { verifyViteTailEvidence } from '../scripts/diagnostics/vite-tail-evidence.mjs'
import { createViteTailObserver } from '../scripts/diagnostics/vite-tail-observer.mjs'

const roots = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => fs.rm(root, { recursive: true, force: true })))
})
async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'vite-tail-evidence-'))
  roots.push(root)
  const operations = createOperationRecorder({ writer: createEvidenceWriter(root), root, phase: () => ({ type: 'build-start' }) })
  const tail = createViteTailObserver({ operations })
  tail.configuration({ command: 'build', build: {} })
  for (const point of ['main-finalizer', 'snapshot.before', 'snapshot.after']) {
    tail.point(point)
  }
  for (const phase of ['css-finalizer', 'rollup-write']) {
    tail.end(tail.begin(phase))
  }
  const writeBundle = tail.begin('rollup-writeBundle')
  tail.end(tail.begin('vite-reporter'))
  tail.end(writeBundle)
  tail.end(tail.begin('rollup-close'))
  return { root, summary: tail.summary() }
}

describe('尾部阶段证据复核', () => {
  it('核对同一 operation 序列的内存字段和实际阶段，缺失配置保持 unknown', async () => {
    const { root, summary } = await fixture()
    await expect(verifyViteTailEvidence(root, summary)).resolves.toBe(summary)
    const event = JSON.parse(await fs.readFile(path.join(root, 'operation-1.json'), 'utf8'))
    expect(event.details.configuration.sourcemap).toBe('unknown')
    expect(event.details.configuration.reportCompressedSize).toBe('unknown')
    expect(event.details.memory.rss).toBeGreaterThan(0)
  })

  it('实际事件被替换、内存字段缺失或摘要伪造时拒绝通过', async () => {
    const { root, summary } = await fixture()
    const file = path.join(root, 'operation-7.json')
    const event = JSON.parse(await fs.readFile(file, 'utf8'))
    delete event.details.memory.external
    await fs.writeFile(file, JSON.stringify(event))
    await expect(verifyViteTailEvidence(root, summary)).rejects.toThrow('不符')
    await expect(verifyViteTailEvidence(root, { ...summary, events: summary.events.slice(1) })).rejects.toThrow('缺失')
  })
})
