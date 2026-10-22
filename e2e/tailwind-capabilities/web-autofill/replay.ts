import type { CapabilityReport } from '../types'
import type { AutofillSidecar } from './types'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { digest } from '../identity'
import { assertionPassed } from '../report'
import { autofillAssertions, autofillContract } from './contract'
import { autofillProbe, autofillScreenshot, autofillStates } from './fixtures'

/** 重读本轮原件，不信任 sidecar 或报告中缓存的 passed。 */
export async function replayAutofill(directory: string, runId: string, browserVersion: string) {
  const raw = JSON.parse(await readFile(path.join(directory, 'measurements.json'), 'utf8')) as AutofillSidecar
  if (raw.schemaVersion !== 2 || raw.id !== `runtime/${autofillProbe.id}` || raw.runId !== runId || raw.engine !== 'chromium' || raw.host !== 'full-chromium' || raw.browserVersion !== browserVersion) {
    throw new Error('Autofill 原始证据身份不匹配')
  }
  if (!Array.isArray(raw.warnings) || raw.warnings.some(value => typeof value !== 'string') || !Array.isArray(raw.observation?.timeline) || !Array.isArray(raw.observation.commands) || !Array.isArray(raw.observation.events) || !Array.isArray(raw.observation.states) || !Array.isArray(raw.observation.cleanup?.errors) || typeof raw.observation.cleanup.detached !== 'boolean' || (raw.error !== undefined && (typeof raw.error !== 'string' || !raw.error))) {
    throw new Error('Autofill 原始证据结构无效')
  }
  if (!raw.generation || !Array.isArray(raw.generation.candidates) || raw.generation.candidates.some(value => typeof value !== 'string')) {
    throw new Error('Autofill 缺少生成候选证据')
  }
  const css = await readFile(path.join(directory, 'generated.css'), 'utf8')
  const screenshots = new Map(await Promise.all(autofillStates.map(async state => [autofillScreenshot(state), await readFile(path.join(directory, autofillScreenshot(state)))] as const)))
  const generated = raw.generation.cssHash === digest(css) && raw.generation.candidates.includes(autofillProbe.candidate)
  const assertions = autofillAssertions(autofillContract(runId), raw.observation, generated, screenshots, digest(css))
  return { assertions, warnings: raw.warnings, error: raw.error }
}

export async function verifyAutofillReport(report: CapabilityReport, directory: string) {
  const result = report.results.find(item => item.id === `runtime/${autofillProbe.id}`)
  if (!result || result.status !== 'passed') {
    return
  }
  if (report.target !== 'web-chromium' || report.environment['host'] !== 'full-chromium') {
    throw new Error('Autofill 需要完整 Chromium 原生协议宿主')
  }
  if (['generated.css', 'measurements.json', ...autofillStates.map(autofillScreenshot)].some(file => !result.artifacts.includes(file))) {
    throw new Error('Autofill 缺少完整原始产物')
  }
  const replay = await replayAutofill(directory, report.runId, String(report.environment['browserVersion']))
  if (replay.error || replay.warnings.length || result.warnings.length || !replay.assertions.every(assertionPassed) || digest(replay.assertions) !== digest(result.assertions)) {
    throw new Error('Autofill 原始证据重放不通过或与报告不一致')
  }
}
