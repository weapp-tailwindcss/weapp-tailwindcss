import type { Launcher } from '../../../scripts/wechat/automator'
import type { RunContext } from '../context'
import type { CapabilityReport, SemanticAssertion } from '../types'
import type { WeappObservation, WeappProbe, WeappSidecar } from './types'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { PNG } from 'pngjs'
import { captureMiniProgramViewport, cropMiniProgramViewport } from '../../../scripts/demo-visual-e2e-report/mini-program-screenshot'
import { runWithCleanup } from '../../../scripts/e2e-preflight/cleanup'
import { receipt } from '../report'
import { assertWeappCompositeEncoding } from './compositing'
import { weappStates } from './phases'
import { weappPhaseInput } from './render'
import { weappObservationAssertions } from './replay'

type Mini = Awaited<ReturnType<Launcher['launch']>>
type Page = Awaited<ReturnType<Mini['reLaunch']>>
type Element = NonNullable<Awaited<ReturnType<Page['$']>>>

async function styles(node: Element, properties: Readonly<Record<string, string>>) {
  return Object.fromEntries(await Promise.all(Object.keys(properties).map(async property => [property, await node.style(property)])))
}

/** 页面统一推进预声明阶段；采集原始状态后由同一生产重放器重算断言。 */
export async function captureWeappProbe(context: RunContext, report: CapabilityReport, mini: Mini, page: Page, probe: WeappProbe, cssHash: string) {
  const states = weappStates(probe)
  const inputs = states.map(state => weappPhaseInput(state, context.runId, probe.id, cssHash))
  await page.setData({ probe: { id: probe.id, text: !!probe.text, empty: !!probe.empty }, states: inputs, phaseIndex: 0, state: inputs[0] })
  const assertions: SemanticAssertion[] = []
  const artifacts: string[] = []
  const phases: WeappObservation[] = []
  await runWithCleanup(async () => {
    for (const [index, state] of states.entries()) {
      if (index) {
        const toggle = await page.$('#toggle')
        if (!toggle) {
          throw new Error('微信阶段切换按钮未渲染')
        }
        await toggle.tap()
      }
      await page.waitFor(200)
      const [node, reference, marker, identity, witness, foreground, background, gray] = await Promise.all(['#probe', '#reference', '#evidence-marker', '#identity', '#weight-witness', '#composite-foreground', '#composite-background', '#composite-gray'].map(selector => page.$(selector)))
      if (!node || !reference || !marker || !identity || (state.witness && !witness) || (state.composite && (!foreground || !background || !gray))) {
        throw new Error(`${probe.id} 未渲染目标、参考、标记或变量见证`)
      }
      const data = await page.data()
      const rectangle = async (element: Element) => ({ ...await element.offset(), ...await element.size() })
      const observation: WeappObservation = {
        name: data.state.name,
        index: data.phaseIndex,
        input: data.state,
        identityText: await identity.text(),
        actual: await styles(node, state.expected),
        reference: await styles(reference, state.referenceExpected ?? state.expected),
        witness: witness ? await styles(witness, state.witness?.expected ?? {}) : {},
        rectangles: { probe: await rectangle(node), reference: await rectangle(reference), marker: await rectangle(marker), ...(state.composite ? { foreground: await rectangle(foreground!), background: await rectangle(background!), gray: await rectangle(gray!) } : {}) },
      }
      if (observation.name !== state.name || observation.index !== index) {
        throw new Error('微信实际阶段未按输入动作推进')
      }
      const file = path.join(context.directory, `${probe.id}-${state.name}.png`)
      const image = await captureMiniProgramViewport(mini, file, 30_000)
      const metrics = JSON.parse(await readFile(`${file}.viewport.json`, 'utf8'))
      const original = await readFile(`${file}.full.png`)
      if (state.composite) {
        assertWeappCompositeEncoding(original)
      }
      const raw = cropMiniProgramViewport(PNG.sync.read(original), metrics)
      phases.push(observation)
      for (const [artifact, kind] of [[file, 'screenshot'], [`${file}.full.png`, 'screenshot'], [`${file}.viewport.json`, 'measurements']] as const) {
        const entry = await receipt(artifact, context.directory, context.runId, [probe.id], kind)
        report.artifacts.push(entry)
        artifacts.push(entry.path)
      }
      assertions.push(...weappObservationAssertions(probe, observation, image, metrics.windowWidth, context.runId, cssHash, raw))
    }
  }, async () => {
    const file = path.join(context.directory, `${probe.id}.json`)
    const sidecar: WeappSidecar = { schemaVersion: 2, runId: context.runId, caseId: probe.id, cssHash, sourceHash: report.identity.sourceHash, fixtureHash: report.identity.fixtureHash, phases }
    await writeFile(file, JSON.stringify(sidecar, null, 2))
    const entry = await receipt(file, context.directory, context.runId, [probe.id], 'measurements')
    report.artifacts.push(entry)
    artifacts.push(entry.path)
  })
  return { assertions, artifacts }
}
