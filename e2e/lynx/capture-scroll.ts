import type { NativeEvidenceContext } from '../../examples/react-lynx/src/compatibility/types'
import fs from 'node:fs/promises'
import path from 'node:path'

/** 只接受本轮原生 UIScrollView 实际测量到的往返偏移，保留失败原始证据。 */
export function validateCaptureScrollEvidence(source: string, context: NativeEvidenceContext, expectedDurationSeconds?: number) {
  const value = JSON.parse(source) as Record<string, unknown>
  if (value.version !== context.version || value.runId !== context.runId || value.bundleSha256 !== context.bundleSha256) {
    throw new Error('iOS 原生滚动证据不属于本轮 bundle/run。')
  }
  const number = (name: string) => typeof value[name] === 'number' && Number.isFinite(value[name]) ? value[name] as number : Number.NaN
  const range = number('scrollRange')
  const duration = number('captureDurationSeconds')
  const minimum = number('minimumOffset')
  const before = number('beforeOffset')
  const after = number('afterOffset')
  const returned = number('returnedOffset')
  const started = number('scrollStartedSeconds')
  const measured = number('afterSeconds')
  const returning = number('returnStartedSeconds')
  const completed = number('completedSeconds')
  const dates = ['startedAt', 'scrollStartedAt', 'afterAt', 'returnStartedAt', 'completedAt'].map(key => Date.parse(String(value[key])))
  if (value.error || !String(value.scrollViewClass ?? '').trim() || !(range > 0)
    || !Number.isInteger(duration) || duration < 8 || duration > 180
    || (expectedDurationSeconds !== undefined && duration !== expectedDurationSeconds)
    || ![minimum, before, after, returned, started, measured, returning, completed].every(Number.isFinite)
    || after - before < 1 || after > minimum + range + 1 || after < minimum - 1
    || Math.abs(returned - minimum) > 1 || after - returned < 1
    || !(started > 0 && measured > started && returning > measured && completed > returning)
    || returning < duration - 0.55 || returning > duration + 0.25
    || dates.some((date, index) => !Number.isFinite(date) || (index > 0 && date < dates[index - 1]!))) {
    throw new Error('iOS 原生滚动没有有效往返偏移、滚动范围或时间证据；已保留 capture-scroll.json。')
  }
  return value
}

export async function collectCaptureScrollEvidence(sourceFile: string, artifactDir: string, context: NativeEvidenceContext, expectedDurationSeconds?: number) {
  const source = await fs.readFile(sourceFile, 'utf8')
  await fs.writeFile(path.join(artifactDir, 'capture-scroll.json'), source, { flag: 'wx' })
  return validateCaptureScrollEvidence(source, context, expectedDurationSeconds)
}
