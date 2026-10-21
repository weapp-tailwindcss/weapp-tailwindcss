import type { CapabilityReport } from '../types'
import type { NativeMediaSidecar } from './types'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { digest } from '../identity'
import { assertionPassed } from '../report'
import { nativeMediaAssertions, nativeMediaContract } from './contract'
import { nativeMediaProbe, nativeMediaStates } from './fixtures'

/** 原始 sidecar、CSS 和 PNG 都从本轮目录复读；不信任已缓存的断言。 */
export async function replayNativeMedia(directory: string, runId: string, browserVersion: string) {
  const raw = JSON.parse(await readFile(path.join(directory, 'measurements.json'), 'utf8')) as NativeMediaSidecar
  if (raw.schemaVersion !== 2 || raw.id !== `runtime/${nativeMediaProbe.id}` || raw.runId !== runId || raw.engine !== 'chromium' || raw.browserVersion !== browserVersion) {
    throw new Error('原生媒体 sidecar 身份不匹配')
  }
  if (!Array.isArray(raw.warnings) || raw.warnings.some(value => typeof value !== 'string')
    || !Array.isArray(raw.observation?.states) || !Array.isArray(raw.observation?.cleanup?.errors)
    || raw.observation.cleanup.errors.some(value => typeof value !== 'string')
    || typeof raw.observation.cleanup.detached !== 'boolean'
    || (raw.error !== undefined && (typeof raw.error !== 'string' || !raw.error))) {
    throw new Error('原生媒体 sidecar 结构无效')
  }
  if (!raw.generation || !Array.isArray(raw.generation.candidates) || raw.generation.candidates.some(value => typeof value !== 'string')) {
    throw new Error('原生媒体 sidecar 缺少生成候选证据')
  }
  const css = await readFile(path.join(directory, 'generated.css'), 'utf8')
  const generated = raw.generation?.cssHash === digest(css) && raw.generation.candidates.includes(nativeMediaProbe.candidate)
  const screenshots = new Map(await Promise.all(nativeMediaStates.map(async (name) => {
    const file = `${nativeMediaProbe.id}-${name}.png`
    return [file, await readFile(path.join(directory, file))] as const
  })))
  const assertions = nativeMediaAssertions(nativeMediaContract(runId), raw.observation, generated, screenshots, digest(css))
  return { assertions, warnings: raw.warnings, error: raw.error }
}

/** 统一报告和 coverage 门禁都执行生产重放，拒绝改 sidecar 后保留旧 passed。 */
export async function verifyNativeMediaReport(report: CapabilityReport, directory: string) {
  const result = report.results.find(item => item.id === `runtime/${nativeMediaProbe.id}`)
  if (!result || result.status !== 'passed') {
    return
  }
  if (report.target !== 'web-chromium') {
    throw new Error('原生媒体只能由 Chromium 原生协议验收')
  }
  const files = ['generated.css', 'measurements.json', ...nativeMediaStates.map(name => `${nativeMediaProbe.id}-${name}.png`)]
  if (files.some(file => !result.artifacts.includes(file))) {
    throw new Error('原生媒体缺少完整原始产物')
  }
  const replay = await replayNativeMedia(directory, report.runId, String(report.environment['browserVersion']))
  if (replay.error || replay.warnings.length || result.warnings.length || digest(result.warnings) !== digest(replay.warnings) || !replay.assertions.every(assertionPassed) || digest(replay.assertions) !== digest(result.assertions)) {
    throw new Error('原生媒体原始证据重放不通过或与报告不一致')
  }
}
