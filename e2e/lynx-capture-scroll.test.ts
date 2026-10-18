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
  captureDurationSeconds: 18,
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
  returnStartedAt: '2026-10-18T00:00:17Z',
  returnStartedSeconds: 17.5,
  completedAt: '2026-10-18T00:00:18Z',
  completedSeconds: 18.4,
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
  { afterSeconds: 17.6 },
  { captureDurationSeconds: undefined },
  { captureDurationSeconds: 7 },
  { returnStartedSeconds: 8.2, completedSeconds: 9.1 },
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

it.each([8, 15, 18, 180])('accepts native return timing bound to a %s-second capture', (duration) => {
  const timed = { ...evidence, captureDurationSeconds: duration, returnStartedSeconds: duration - 0.5, completedSeconds: duration + 0.4 }
  expect(() => validateCaptureScrollEvidence(JSON.stringify(timed), context, duration)).not.toThrow()
  expect(() => validateCaptureScrollEvidence(JSON.stringify(timed), context, duration + 1)).toThrow('原生滚动')
})

it('accepts measured iOS dispatch jitter while preserving identity and actual movement checks', () => {
  const measured = {
    ...evidence,
    scrollRange: 202,
    targetOffset: 202,
    afterOffset: 202,
    scrollStartedSeconds: 5.078655416611582,
    afterSeconds: 6.036015749908984,
    returnStartedSeconds: 18.405550958239473,
    completedSeconds: 19.35633741656784,
    startedAt: '2026-10-18T09:55:49Z',
    scrollStartedAt: '2026-10-18T09:55:54Z',
    afterAt: '2026-10-18T09:55:55Z',
    returnStartedAt: '2026-10-18T09:56:07Z',
    completedAt: '2026-10-18T09:56:08Z',
  }
  expect(() => validateCaptureScrollEvidence(JSON.stringify(measured), context, 18)).not.toThrow()
  expect(() => validateCaptureScrollEvidence(JSON.stringify({ ...measured, runId: 'old' }), context, 18)).toThrow('本轮 bundle/run')
  expect(() => validateCaptureScrollEvidence(JSON.stringify({ ...measured, afterOffset: 0 }), context, 18)).toThrow('原生滚动')
})

it.each([
  { returnStartedSeconds: 20.001, completedSeconds: 20.95 },
  { returnStartedSeconds: 18.40555, completedSeconds: 18.3 },
  { returnStartedSeconds: 17.4, completedSeconds: 18.3 },
])('rejects implausible late, unordered or premature native return times: %j', (change) => {
  expect(() => validateCaptureScrollEvidence(JSON.stringify({ ...evidence, ...change }), context, 18)).toThrow('原生滚动')
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
