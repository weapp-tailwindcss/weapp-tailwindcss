import type { BrowserEngine, CapabilityReport } from '../types'
import type { HistorySidecar } from './types'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { digest } from '../identity'
import { assertionPassed } from '../report'
import { historyAssertions } from './contract'
import { historyProbe, historyScreenshot } from './fixtures'

/** 重读原始 CSS、导航回执、独立 profile 与 PNG，不信任已缓存的 passed。 */
export async function replayHistory(directory: string, runId: string, engine: BrowserEngine, browserVersion: string) {
  if (typeof browserVersion !== 'string' || !browserVersion.trim() || ['unknown', 'undefined', 'null'].includes(browserVersion)) {
    throw new Error('历史状态缺少实际浏览器版本')
  }
  const raw = JSON.parse(await readFile(path.join(directory, 'measurements.json'), 'utf8')) as HistorySidecar
  if (raw.schemaVersion !== 3 || raw.id !== `runtime/${historyProbe.id}` || raw.runId !== runId || raw.engine !== engine || !browserVersion || raw.browserVersion !== browserVersion) {
    throw new Error('历史状态 sidecar 身份不匹配')
  }
  if (!Array.isArray(raw.warnings) || raw.warnings.some(value => typeof value !== 'string')
    || !Array.isArray(raw.observationFailures) || !Array.isArray(raw.states) || !Array.isArray(raw.navigation) || !Array.isArray(raw.requests)
    || !Array.isArray(raw.profiles) || !Array.isArray(raw.lifecycle)
    || !Array.isArray(raw.cleanup?.errors) || !Array.isArray(raw.cleanup.closedProfiles) || !Array.isArray(raw.cleanup.removedProfiles)
    || typeof raw.cleanup.serverClosed !== 'boolean'
    || !raw.generation || typeof raw.generation.cssHash !== 'string' || !Array.isArray(raw.generation.candidates) || raw.generation.candidates.some(value => typeof value !== 'string')
    || (raw.error !== undefined && (typeof raw.error !== 'string' || !raw.error))) {
    throw new Error('历史状态 sidecar 结构无效')
  }
  const css = await readFile(path.join(directory, 'generated.css'), 'utf8')
  const samples = raw.states.find(state => state.name === 'visited')?.observation?.samples
  if (!Array.isArray(samples) || samples.length === 0 || samples.length > 21 || samples.some((sample, index) => sample.attempt !== index + 1 || sample.screenshot !== historyScreenshot('visited', index + 1))) {
    throw new Error('历史状态缺少连续的有界原图观察轨迹')
  }
  const files = ['generated.css', 'measurements.json', historyScreenshot('initial'), ...samples.map((_, index) => historyScreenshot('visited', index + 1)), historyScreenshot('restored')]
  const screenshots = new Map(await Promise.all(files.filter(file => file.endsWith('.png')).map(async file => [file, await readFile(path.join(directory, file))] as const)))
  return { assertions: historyAssertions(raw, screenshots, digest(css), engine, runId), warnings: raw.warnings, error: raw.error, files }
}

export async function verifyHistoryReport(report: CapabilityReport, directory: string) {
  const result = report.results.find(result => result.id === `runtime/${historyProbe.id}`)
  if (!result || result.status !== 'passed') {
    return
  }
  const engine = report.target === 'web-chromium' ? 'chromium' : report.target === 'web-firefox' ? 'firefox' : report.target === 'web-webkit' ? 'webkit' : undefined
  if (!engine) {
    throw new Error('历史状态证据只能由真实 Web 浏览器验收')
  }
  const browserVersion = report.environment['browserVersion']
  if (typeof browserVersion !== 'string') {
    throw new TypeError('历史状态报告缺少实际浏览器版本')
  }
  const replay = await replayHistory(directory, report.runId, engine, browserVersion)
  if (replay.files.some(file => !result.artifacts.includes(file))) {
    throw new Error('历史状态缺少完整原始产物')
  }
  if (replay.error || replay.warnings.length || result.warnings.length || digest(result.warnings) !== digest(replay.warnings) || !replay.assertions.every(assertionPassed) || digest(replay.assertions) !== digest(result.assertions)) {
    throw new Error('历史状态原始证据重放不通过或与报告不一致')
  }
}
