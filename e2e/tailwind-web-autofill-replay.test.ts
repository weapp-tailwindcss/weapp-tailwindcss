import type { CapabilityReport } from './tailwind-capabilities/types'
import type { AutofillSidecar } from './tailwind-capabilities/web-autofill/types'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { digest } from './tailwind-capabilities/identity'
import { assertionPassed } from './tailwind-capabilities/report'
import { autofillProbe } from './tailwind-capabilities/web-autofill/fixtures'
import { replayAutofill, verifyAutofillReport } from './tailwind-capabilities/web-autofill/replay'
import { syntheticAutofill } from './tailwind-capabilities/web-autofill/test-fixture'

const directories: string[] = []
afterEach(async () => {
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})

async function setup() {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'tailwind-autofill-replay-'))
  directories.push(directory)
  const css = '/* 合成证据只验证生产重放拒绝边界 */'
  const fixture = syntheticAutofill('unit-autofill-replay', digest(css))
  const raw: AutofillSidecar = { schemaVersion: 2, id: `runtime/${autofillProbe.id}`, runId: fixture.runId, engine: 'chromium', browserVersion: 'unit-browser', host: 'full-chromium', generation: { cssHash: fixture.cssHash, candidates: [autofillProbe.candidate] }, observation: fixture.observation, warnings: [] }
  await writeFile(path.join(directory, 'measurements.json'), JSON.stringify(raw))
  await writeFile(path.join(directory, 'generated.css'), css)
  await Promise.all([...fixture.screenshots].map(([name, bytes]) => writeFile(path.join(directory, name), bytes)))
  return { directory, raw, fixture }
}

it('从原始 CSS、原生事件、renderer 观察和 PNG 重算，不依赖 passed 字段', async () => {
  const { directory, fixture } = await setup()
  const replay = await replayAutofill(directory, fixture.runId, 'unit-browser')
  expect(replay.assertions.every(assertionPassed)).toBe(true)
})

it.each(['runId', 'host', 'browserVersion'] as const)('过期或错误 %s 身份拒绝', async (key) => {
  const { directory, fixture, raw } = await setup()
  Object.assign(raw, { [key]: 'stale' })
  await writeFile(path.join(directory, 'measurements.json'), JSON.stringify(raw))
  await expect(replayAutofill(directory, fixture.runId, 'unit-browser')).rejects.toThrow('身份')
})

it('sidecar 篡改且报告仍缓存成功时，统一生产门禁拒绝', async () => {
  const { directory, fixture, raw } = await setup()
  const replay = await replayAutofill(directory, fixture.runId, 'unit-browser')
  const report = { target: 'web-chromium', runId: fixture.runId, environment: { browserVersion: 'unit-browser', host: 'full-chromium' }, results: [{ id: raw.id, status: 'passed', warnings: [], assertions: replay.assertions, artifacts: ['generated.css', 'measurements.json', ...fixture.screenshots.keys()] }] } as unknown as CapabilityReport
  await verifyAutofillReport(report, directory)
  raw.observation.states[1]!.fields['probe']!.outline.style = 'none'
  await writeFile(path.join(directory, 'measurements.json'), JSON.stringify(raw))
  await expect(verifyAutofillReport(report, directory)).rejects.toThrow('重放')
})

it('CSS 摘要、缺截图或损坏 PNG 不得被缓存断言替代', async () => {
  const { directory, fixture } = await setup()
  await writeFile(path.join(directory, 'generated.css'), 'changed css')
  expect((await replayAutofill(directory, fixture.runId, 'unit-browser')).assertions.find(item => item.name === 'generated')?.actual).toBe(false)
  const name = [...fixture.screenshots.keys()][1]!
  await writeFile(path.join(directory, name), 'bad png')
  await expect(replayAutofill(directory, fixture.runId, 'unit-browser')).rejects.toThrow()
  await rm(path.join(directory, name))
  await expect(readFile(path.join(directory, name))).rejects.toThrow()
  await expect(replayAutofill(directory, fixture.runId, 'unit-browser')).rejects.toThrow()
})
