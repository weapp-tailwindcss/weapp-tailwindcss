import { Buffer } from 'node:buffer'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { collectCaptureScrollEvidence, validateCaptureScrollEvidence } from './lynx/capture-scroll'
import { createEvidenceContext } from './lynx/evidence'

const context = createEvidenceContext(Buffer.from('真实录制 bundle'))
const evidence = {
  ...context,
  scrollViewClass: 'LynxScrollView',
  scrollRange: 600,
  minimumOffset: 0,
  beforeOffset: 0,
  targetOffset: 350,
  afterOffset: 350,
  returnedOffset: 0,
  startedAt: '2026-10-18T00:00:00Z',
  scrollStartedAt: '2026-10-18T00:00:04Z',
  scrollStartedSeconds: 4.8,
  afterAt: '2026-10-18T00:00:05Z',
  afterSeconds: 5.7,
  returnStartedAt: '2026-10-18T00:00:08Z',
  returnStartedSeconds: 8.2,
  completedAt: '2026-10-18T00:00:09Z',
  completedSeconds: 9.1,
}
const directories: string[] = []
afterEach(async () => {
  await Promise.all(directories.splice(0).map(directory => fs.rm(directory, { recursive: true, force: true })))
})

it('accepts actual native scroll offsets and non-zero adjusted content insets', () => {
  expect(validateCaptureScrollEvidence(JSON.stringify(evidence), context)).toEqual(evidence)
  expect(() => validateCaptureScrollEvidence(JSON.stringify({ ...evidence, minimumOffset: -10, beforeOffset: -10, returnedOffset: -10 }), context)).not.toThrow()
})

it.each([
  { scrollRange: 0 },
  { afterOffset: 0 },
  { afterOffset: 700 },
  { returnedOffset: 350 },
  { returnedOffset: undefined },
  { completedSeconds: undefined },
  { afterSeconds: 8.3 },
  { completedAt: 'invalid' },
  { completedAt: '2026-10-17T00:00:09Z' },
  { scrollViewClass: '' },
  { error: '没有找到 UIScrollView' },
])('rejects missing movement, completion or invalid time/range: %j', (change) => {
  expect(() => validateCaptureScrollEvidence(JSON.stringify({ ...evidence, ...change }), context)).toThrow('原生滚动')
})

it.each([{ runId: 'old-run' }, { bundleSha256: '0'.repeat(64) }])('rejects a stale run or bundle identity: %j', (change) => {
  expect(() => validateCaptureScrollEvidence(JSON.stringify({ ...evidence, ...change }), context)).toThrow('本轮 bundle/run')
})

it('copies failed raw evidence before validation and preserves an existing run artifact', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'lynx-scroll-'))
  directories.push(directory)
  const artifactDir = path.join(directory, 'artifacts')
  await fs.mkdir(artifactDir)
  const source = JSON.stringify({ ...evidence, afterOffset: 0 })
  const input = path.join(directory, 'native-scroll.json')
  const output = path.join(artifactDir, 'capture-scroll.json')
  await fs.writeFile(input, source)
  await expect(collectCaptureScrollEvidence(input, artifactDir, context)).rejects.toThrow('原生滚动')
  expect(await fs.readFile(output, 'utf8')).toBe(source)
  await fs.writeFile(input, JSON.stringify(evidence))
  await expect(collectCaptureScrollEvidence(input, artifactDir, context)).rejects.toMatchObject({ code: 'EEXIST' })
  expect(await fs.readFile(output, 'utf8')).toBe(source)
})
