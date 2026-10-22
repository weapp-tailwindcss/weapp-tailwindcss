import type { Buffer } from 'node:buffer'
import type { CaseContract, SemanticAssertion } from '../types'
import type { MediaCommand, MediaObservation } from './types'
import { digest } from '../identity'
import { readPixels, rgbaChannels } from '../web/pixels'
import { mediaValue, nativeMediaCss, nativeMediaElements, nativeMediaProbe, nativeMediaQueries, nativeMediaReference, nativeMediaStates, nativeMediaUrl } from './fixtures'
import { identityColors } from './identity'
import { contrastParameters } from './native'

export function nativeMediaContract(runId: string): CaseContract {
  const expected: CaseContract['expectedValues'] = { 'generated': true, 'states/exact-order': true, 'cleanup/reset': true, 'cleanup/detached': true, 'cleanup/no-errors': true }
  for (const state of nativeMediaStates) {
    Object.assign(expected, { [`${state}/fixture/id`]: nativeMediaProbe.id, [`${state}/fixture/run-id`]: runId, [`${state}/fixture/url`]: nativeMediaUrl(runId), [`${state}/command`]: true, [`${state}/frames-advanced`]: true })
    for (const query of nativeMediaQueries) {
      expected[`${state}/media/${query}`] = query === mediaValue(state)
    }
    expected[`${state}/pixel/identity-current`] = true
    for (const [index, id] of nativeMediaElements.entries()) {
      const active = state === 'less' && id !== 'control'
      const rgba = active ? [18, 52, 86, 255] : [1, 2, 3, 255]
      expected[`${state}/background/${id}`] = active ? 'rgb(18, 52, 86)' : 'rgb(1, 2, 3)'
      Object.assign(expected, { [`${state}/rect/${id}/left`]: 24, [`${state}/rect/${id}/top`]: 24 + index * 40, [`${state}/rect/${id}/width`]: 160, [`${state}/rect/${id}/height`]: 40 })
      for (const [channel, name] of rgbaChannels.entries()) {
        expected[`${state}/pixel/${id}/${name}`] = rgba[channel]!
      }
    }
  }
  const names = Object.keys(expected)
  return { id: `runtime/${nativeMediaProbe.id}`, candidate: nativeMediaProbe.candidate, features: [...nativeMediaProbe.features], fixture: JSON.stringify({ probe: nativeMediaProbe, css: nativeMediaCss, reference: nativeMediaReference, states: nativeMediaStates }), expectation: { support: 'supported', stage: 'runtime' }, requiredAssertions: names, expectedValues: expected, assertionStages: { generated: 'generation', ...Object.fromEntries(names.filter(name => name.includes('/pixel/')).map(name => [name, 'visual' as const])) } }
}

function commandPassed(command: MediaCommand | undefined, params: MediaCommand['params']) {
  return Boolean(command && command.method === 'Emulation.setEmulatedMedia' && !command.error && command.response && typeof command.response === 'object' && !Array.isArray(command.response) && Object.keys(command.response).length === 0 && digest(command.params) === digest(params))
}

/** 从本轮原始协议、媒体值、几何及 PNG 重算，缓存的 passed 字段没有判定作用。 */
export function nativeMediaAssertions(contract: CaseContract, observation: MediaObservation, generated: boolean, screenshots: ReadonlyMap<string, Buffer>, cssHash: string): SemanticAssertion[] {
  const values: Record<string, SemanticAssertion['actual'] | undefined> = { generated, 'states/exact-order': digest(observation.states.map(state => state.name)) === digest(nativeMediaStates), 'cleanup/reset': commandPassed(observation.cleanup.reset, { media: '', features: [] }), 'cleanup/detached': observation.cleanup.detached, 'cleanup/no-errors': observation.cleanup.errors.length === 0 }
  for (const name of nativeMediaStates) {
    const states = observation.states.filter(state => state.name === name)
    if (states.length !== 1) {
      continue
    }
    const state = states[0]!
    Object.assign(values, { [`${name}/fixture/id`]: state.id, [`${name}/fixture/run-id`]: state.runId, [`${name}/fixture/url`]: state.url, [`${name}/command`]: commandPassed(state.command, contrastParameters(mediaValue(name))), [`${name}/frames-advanced`]: state.frames.length === 2 && state.frames.every(Number.isFinite) && state.frames[1]! > state.frames[0]! && (name === 'initial' || state.frames[0]! > observation.states[observation.states.indexOf(state) - 1]!.frames[1]!) })
    for (const query of nativeMediaQueries) {
      values[`${name}/media/${query}`] = state.queries[query]
    }
    const bytes = state.screenshot === `${nativeMediaProbe.id}-${name}.png` ? screenshots.get(state.screenshot) : undefined
    if (bytes) {
      const samples = identityColors(String(contract.expectedValues[`${name}/fixture/run-id`]), name, cssHash).map((_, index) => ({ id: `identity-${index}`, x: (index + 0.5) / 8, y: 0.5, expected: [0, 0, 0, 0] as [number, number, number, number], tolerance: 0 }))
      const pixels = readPixels(bytes, { left: 24, top: 160, width: 32, height: 4 }, samples)
      const colors = identityColors(String(contract.expectedValues[`${name}/fixture/run-id`]), name, cssHash)
      values[`${name}/pixel/identity-current`] = pixels.every((pixel, index) => digest(pixel.rgba) === digest([...colors[index]!, 255]))
    }
    for (const id of nativeMediaElements) {
      values[`${name}/background/${id}`] = state.backgrounds[id]
      const rect = state.rects[id]
      for (const field of ['left', 'top', 'width', 'height'] as const) {
        values[`${name}/rect/${id}/${field}`] = rect?.[field]
      }
      if (bytes && rect && Object.values(rect).every(Number.isFinite) && rect.width > 0 && rect.height > 0) {
        const pixel = readPixels(bytes, rect, [{ id, x: 0.5, y: 0.5, expected: [0, 0, 0, 0], tolerance: 0 }])[0]!
        for (const [channel, key] of rgbaChannels.entries()) {
          values[`${name}/pixel/${id}/${key}`] = pixel.rgba[channel]
        }
      }
    }
  }
  return contract.requiredAssertions.map(name => ({ name, stage: contract.assertionStages?.[name] ?? 'runtime', actual: values[name] ?? null, expected: contract.expectedValues[name]! }))
}
