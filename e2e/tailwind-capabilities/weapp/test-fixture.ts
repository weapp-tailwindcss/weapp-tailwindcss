import type { Buffer } from 'node:buffer'
import type { CapabilityReport } from '../types'
import type { WeappObservation, WeappProbe, WeappSidecar } from './types'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { PNG } from 'pngjs'
import { digest } from '../identity'
import { receipt } from '../report'
import { weappFixtureCss } from './alpha-fixtures'
import { compositeGray, nominalCompositeSamples, weappCompositeAssertions } from './compositing'
import { weappContract, weappRuntimeAssertions } from './contract'
import { weappMarker } from './marker'
import { weappStates } from './phases'
import { weappPhasePixelAssertions } from './pixels'
import { weappPhaseInput, weappProjectFiles, weappRenderContract } from './render'

/** 合成图仅用于证据协议反例，不能登记为微信实际运行。 */
export async function weappReplayFixture(root: string, probe: WeappProbe) {
  const contract = weappContract(probe)
  const css = '.synthetic-protocol-fixture{}'
  const cssHash = digest(css)
  const runId = 'synthetic-weapp-protocol'
  const fixture = { probes: [probe], css: weappFixtureCss, render: weappRenderContract }
  const identity = { sourceHash: digest('synthetic-source'), lockfileHash: digest('synthetic-lock'), catalogHash: digest([contract.id]), fixtureHash: digest({ target: 'weapp', fixture }), expectationsHash: digest(contract), versions: { synthetic: 'protocol-only' } }
  const report: CapabilityReport = { schemaVersion: 2, target: 'weapp', runId, observedAt: new Date().toISOString(), identity, environment: { provider: 'synthetic-protocol-only', appid: 'wx-test' }, results: [], artifacts: [] }
  const sources = weappProjectFiles(css, runId, 'wx-test')
  const artifacts: string[] = []
  async function save(name: string, bytes: string | Buffer, kind: 'css' | 'bundle' | 'measurements' | 'screenshot') {
    const file = path.join(root, ...name.split('/'))
    await mkdir(path.dirname(file), { recursive: true })
    await writeFile(file, bytes)
    report.artifacts.push(await receipt(file, root, runId, [probe.id], kind))
    artifacts.push(path.relative(root, file))
  }
  await save('generated.wxss', css, 'css')
  for (const [name, content] of Object.entries(sources)) {
    await save(`project/${name}`, content, 'bundle')
  }
  const phases: WeappObservation[] = []
  const assertions = []
  const metrics = { screenWidth: 200, screenHeight: 240, screenTop: 20, windowWidth: 200, windowHeight: 220, hasNativeTabBar: false }
  for (const [index, state] of weappStates(probe).entries()) {
    const rectangles: WeappObservation['rectangles'] = { marker: { left: 8, top: 8, width: 64, height: 32 }, probe: { left: 10, top: 60, width: 80, height: 48 }, reference: { left: 10, top: 130, width: 80, height: 48 }, ...(state.composite ? { foreground: { left: 110, top: 60, width: 20, height: 20 }, background: { left: 140, top: 60, width: 20, height: 20 }, gray: { left: 170, top: 60, width: 20, height: 20 } } : {}) }
    const image = new PNG({ width: 200, height: 220 })
    image.data.fill(255)
    const paint = (left: number, top: number, width: number, height: number, rgba: readonly number[]) => {
      for (let y = top; y < top + height; y++) {
        for (let x = left; x < left + width; x++) {
          image.data.set(rgba, (y * image.width + x) * 4)
        }
      }
    }
    const marker = weappMarker(runId, probe.id, state.name, cssHash)
    for (const [cell, bit] of marker.bits.entries()) {
      paint(8 + cell % 16 * 4, 8 + Math.floor(cell / 16) * 4, 4, 4, bit ? [224, 128, 32, 255] : [32, 64, 96, 255])
    }
    if (state.pixel) {
      paint(10, 60, 80, 48, state.pixel.actual)
      paint(10, 130, 80, 48, state.pixel.reference)
    }
    if (state.composite) {
      const samples = nominalCompositeSamples(state.composite)
      paint(10, 60, 80, 48, samples.actual)
      paint(10, 130, 80, 48, samples.reference)
      paint(110, 60, 20, 20, state.composite.foreground)
      paint(140, 60, 20, 20, state.composite.background)
      paint(170, 60, 20, 20, compositeGray)
    }
    const full = new PNG({ width: 200, height: 240 })
    full.data.fill(255)
    PNG.bitblt(image, full, 0, 0, 200, 220, 0, 20)
    const name = `${probe.id}-${state.name}.png`
    await save(name, PNG.sync.write(image), 'screenshot')
    await save(`${name}.full.png`, PNG.sync.write(full), 'screenshot')
    await save(`${name}.viewport.json`, JSON.stringify(metrics), 'measurements')
    const actual = { ...state.expected }
    const reference = { ...(state.referenceExpected ?? state.expected) }
    const witness = { ...state.witness?.expected }
    phases.push({ name: state.name, index, input: weappPhaseInput(state, runId, probe.id, cssHash), identityText: `${runId}|${probe.id}|${state.name}`, actual, reference, witness, rectangles })
    assertions.push(...weappRuntimeAssertions(probe, state.name, actual, reference, witness), ...(state.pixel ? weappPhasePixelAssertions(state.name, state.pixel.actual, state.pixel.reference, state.pixel) : []), ...(state.composite ? weappCompositeAssertions(state.name, nominalCompositeSamples(state.composite), state.composite) : []))
  }
  const sidecar: WeappSidecar = { schemaVersion: 2, runId, caseId: probe.id, cssHash, sourceHash: identity.sourceHash, fixtureHash: identity.fixtureHash, phases }
  await save(`${probe.id}.json`, JSON.stringify(sidecar), 'measurements')
  report.results.push({ id: probe.id, status: 'passed', support: contract.expectation.support, ...(contract.expectation.reason ? { reason: contract.expectation.reason } : {}), assertions, artifacts, warnings: [] })
  return { report, sidecar, contract }
}

export async function resignWeappFixture(report: CapabilityReport, root: string) {
  report.artifacts = await Promise.all(report.artifacts.map(item => receipt(path.join(root, item.path), root, report.runId, item.caseIds, item.kind)))
}

export async function editWeappFixtureImage(file: string, edit: (image: PNG) => void) {
  const image = PNG.sync.read(await readFile(file))
  edit(image)
  await writeFile(file, PNG.sync.write(image))
}
