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
    || returning < duration - 0.55 || returning > duration + 2
    || dates.some((date, index) => !Number.isFinite(date) || (index > 0 && date < dates[index - 1]!))) {
    throw new Error('iOS 原生滚动没有有效往返偏移、滚动范围或时间证据；已保留 capture-scroll.json。')
  }
  return value
}

export async function collectCaptureScrollEvidence(
  sourceFile: string,
  artifactDir: string,
  context: NativeEvidenceContext,
  expectedDurationSeconds?: number,
  { timeoutMs = 10_000, pollIntervalMs = 100 } = {},
) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || !Number.isFinite(pollIntervalMs) || pollIntervalMs <= 0) {
    throw new Error('iOS 原生滚动等待时间必须为有限正数。')
  }
  const output = path.join(artifactDir, 'capture-scroll.json')
  const preserve = (source: string) => fs.writeFile(output, source, { flag: 'wx' })
  const deadline = Date.now() + timeoutMs
  let latest: string | undefined
  while (true) {
    const source = await fs.readFile(sourceFile, 'utf8').catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return undefined
      throw error
    })
    if (source !== undefined) {
      latest = source
      let value: Record<string, unknown>
      try {
        value = JSON.parse(source) as Record<string, unknown>
        if (!value || typeof value !== 'object') throw new Error('iOS 原生滚动证据格式无效。')
      }
      catch (error) {
        await preserve(source)
        throw error
      }
      const terminal = ['returnedOffset', 'completedSeconds', 'completedAt'].every(key => Object.hasOwn(value, key))
      const identityMatches = value.version === context.version && value.runId === context.runId && value.bundleSha256 === context.bundleSha256
      if (terminal || !identityMatches || value.error) {
        await preserve(source)
        return validateCaptureScrollEvidence(source, context, expectedDurationSeconds)
      }
    }
    const remaining = deadline - Date.now()
    if (remaining <= 0) {
      if (latest !== undefined) await preserve(latest)
      throw new Error('等待 iOS 原生滚动完成超时；已保留本轮最后的 capture-scroll.json（若已生成）。')
    }
    await new Promise(resolve => setTimeout(resolve, Math.min(pollIntervalMs, remaining)))
  }
}
