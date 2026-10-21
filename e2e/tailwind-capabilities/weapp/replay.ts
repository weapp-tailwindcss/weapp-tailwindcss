import type { PNG as PngImage } from 'pngjs'
import type { CapabilityReport, CapabilityResult } from '../types'
import type { WeappObservation, WeappProbe, WeappSidecar } from './types'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { PNG } from 'pngjs'
import { cropMiniProgramViewport } from '../../../scripts/demo-visual-e2e-report/mini-program-screenshot'
import { normalizeScreenshotToSrgb } from '../../../scripts/demo-visual-e2e-report/screenshot-color'
import { digest } from '../identity'
import { assertionPassed } from '../report'
import { weappContract, weappRuntimeAssertions } from './contract'
import { weappProbes } from './fixtures'
import { verifyWeappMarker, weappMarker } from './marker'
import { weappState, weappStates } from './phases'
import { sampleWeappPixel, weappPhasePixelAssertions } from './pixels'
import { weappPhaseInput, weappProjectFiles, weappRuntimeFixture } from './render'

export function weappObservationAssertions(probe: WeappProbe, observation: WeappObservation, image: PngImage, viewportWidth: number, runId: string, cssHash: string) {
  const state = weappState(probe, observation.name)
  if (observation.identityText !== `${runId}|${probe.id}|${state.name}`
    || digest(observation.input) !== digest(weappPhaseInput(state, runId, probe.id, cssHash))) {
    throw new Error('微信实际页面输入与本轮夹具/阶段不匹配')
  }
  if (!observation.rectangles || digest(Object.keys(observation.rectangles).sort()) !== digest(['marker', 'probe', 'reference'])) {
    throw new Error('微信缺少完整的目标、参考和标记几何')
  }
  for (const rect of Object.values(observation.rectangles)) {
    const scale = image.width / viewportWidth
    if (![rect.left, rect.top, rect.width, rect.height, scale].every(Number.isFinite)
      || rect.left < 0 || rect.top < 0 || rect.width <= 0 || rect.height <= 0 || scale <= 0
      || (rect.left + rect.width) * scale > image.width + 1 || (rect.top + rect.height) * scale > image.height + 1) {
      throw new Error('微信证据节点几何无效或超出实际视口')
    }
  }
  verifyWeappMarker(image, viewportWidth, observation.rectangles.marker, weappMarker(runId, probe.id, state.name, cssHash))
  return [
    ...weappRuntimeAssertions(probe, state.name, observation.actual, observation.reference, observation.witness),
    ...(state.pixel ? weappPhasePixelAssertions(state.name, sampleWeappPixel(image, viewportWidth, observation.rectangles.probe), sampleWeappPixel(image, viewportWidth, observation.rectangles.reference), state.pixel) : []),
  ]
}

function requireArtifacts(report: CapabilityReport, result: CapabilityResult, files: string[]) {
  for (const name of files) {
    // 名称是受控产物逻辑路径，receipt 使用宿主文件系统相对路径。
    const file = path.join(...name.split('/'))
    const artifact = report.artifacts.find(item => item.path === file)
    if (!result.artifacts.includes(file) || !artifact || artifact.runId !== report.runId || !artifact.caseIds.includes(result.id)) {
      throw new Error(`微信缺少本轮原始产物回执：${file}`)
    }
  }
}

/** 重读项目原件、完整截图和窗口尺寸，重建裁剪及全部阶段断言。 */
export async function verifyWeappReport(report: CapabilityReport, root: string) {
  const selected = report.results.flatMap(result => weappProbes.filter(probe => probe.id === result.id))
  if (report.identity.fixtureHash !== digest({ target: 'weapp', fixture: weappRuntimeFixture(selected) })) {
    throw new Error('微信运行时夹具身份不匹配')
  }
  const passed = report.results.filter(result => result.status === 'passed')
  if (!passed.length) {
    return
  }
  const css = await readFile(path.join(root, 'generated.wxss'), 'utf8')
  const cssHash = digest(css)
  const appid = report.environment['appid']
  if (typeof appid !== 'string' || !appid) {
    throw new Error('微信项目缺少实际 appid')
  }
  const sources = weappProjectFiles(css, report.runId, appid)
  for (const result of passed) {
    const probe = selected.find(probe => probe.id === result.id)
    if (!probe) {
      throw new Error('微信存在未注册的运行时案例')
    }
    requireArtifacts(report, result, ['generated.wxss', `${probe.id}.json`, ...Object.keys(sources).map(name => `project/${name}`), ...weappStates(probe).flatMap((state) => {
      const file = `${probe.id}-${state.name}.png`
      return [file, `${file}.full.png`, `${file}.viewport.json`]
    })])
  }
  for (const [name, expected] of Object.entries(sources)) {
    if (await readFile(path.join(root, 'project', ...name.split('/')), 'utf8') !== expected) {
      throw new Error(`微信项目原件不匹配：${name}`)
    }
  }
  for (const result of passed) {
    const probe = selected.find(probe => probe.id === result.id)
    if (!probe || result.support !== weappContract(probe).expectation.support) {
      throw new Error('微信案例或预声明支持状态不匹配')
    }
    const name = `${probe.id}.json`
    const raw = JSON.parse(await readFile(path.join(root, name), 'utf8')) as WeappSidecar
    const states = weappStates(probe)
    if (raw.schemaVersion !== 2 || raw.runId !== report.runId || raw.caseId !== probe.id || raw.cssHash !== cssHash
      || raw.sourceHash !== report.identity.sourceHash || raw.fixtureHash !== report.identity.fixtureHash
      || !Array.isArray(raw.phases) || raw.phases.length !== states.length) {
      throw new Error('微信 sidecar 身份或完整阶段不匹配')
    }
    const files = ['generated.wxss', name, ...Object.keys(sources).map(name => `project/${name}`)]
    const assertions = []
    for (const [index, state] of states.entries()) {
      const observation = raw.phases[index]!
      if (observation.name !== state.name || observation.index !== index) {
        throw new Error('微信阶段顺序不匹配')
      }
      const file = `${probe.id}-${state.name}.png`
      const metrics = JSON.parse(await readFile(path.join(root, `${file}.viewport.json`), 'utf8'))
      const full = PNG.sync.read(await normalizeScreenshotToSrgb(await readFile(path.join(root, `${file}.full.png`))))
      const image = PNG.sync.read(await readFile(path.join(root, file)))
      const cropped = cropMiniProgramViewport(full, metrics)
      if (image.width !== cropped.width || image.height !== cropped.height || !image.data.equals(cropped.data)) {
        throw new Error('微信裁剪图与原始截图/窗口尺寸不一致')
      }
      files.push(file, `${file}.full.png`, `${file}.viewport.json`)
      assertions.push(...weappObservationAssertions(probe, observation, image, metrics.windowWidth, report.runId, cssHash))
    }
    requireArtifacts(report, result, files)
    if (result.warnings.length || !assertions.every(assertionPassed) || digest(assertions) !== digest(result.assertions)) {
      throw new Error('微信原始证据重放不通过或与报告不一致')
    }
  }
}
