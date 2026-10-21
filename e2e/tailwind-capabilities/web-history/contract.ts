import type { Buffer } from 'node:buffer'
import type { BrowserEngine, CaseContract, SemanticAssertion } from '../types'
import type { HistorySidecar } from './types'
import path from 'node:path'
import { digest } from '../identity'
import { readPixels, rgbaChannels } from '../web/pixels'
import { historyCss, historyElements, historyIdentity, historyPaths, historyProbe, historyReference, historyStates } from './fixtures'

export function historyContract(runId: string): CaseContract {
  const expected: CaseContract['expectedValues'] = { 'generated': true, 'states/order': true, 'navigation/real-history': true, 'navigation/sequence': true, 'server/requests': true, 'profiles/independent': true, 'profiles/lifecycle': true, 'cleanup/profiles': true, 'cleanup/server': true, 'cleanup/no-errors': true }
  for (const state of historyStates) {
    Object.assign(expected, { [`${state}/fixture/id`]: historyProbe.id, [`${state}/fixture/run-id`]: runId, [`${state}/fixture/same-origin`]: true, [`${state}/fixture/url`]: true, [`${state}/profile`]: state === 'restored' ? 'fresh' : 'history', [`${state}/frames`]: true, [`${state}/pixel/identity`]: true })
    for (const [index, id] of historyElements.entries()) {
      Object.assign(expected, { [`${state}/${id}/href`]: true, [`${state}/${id}/width`]: '8px', [`${state}/${id}/style`]: 'solid', [`${state}/${id}/rect/left`]: 24, [`${state}/${id}/rect/top`]: 24 + index * 40, [`${state}/${id}/rect/width`]: 160, [`${state}/${id}/rect/height`]: 40 })
      const rgba = state === 'visited' && id !== 'control' ? [18, 52, 86, 255] : [1, 2, 3, 255]
      for (const edge of ['top', 'right', 'bottom', 'left']) {
        for (const [channel, name] of rgbaChannels.entries()) {
          expected[`${state}/${id}/pixel/${edge}/${name}`] = rgba[channel]!
        }
      }
    }
  }
  const names = Object.keys(expected)
  return { id: `runtime/${historyProbe.id}`, candidate: historyProbe.candidate, features: [...historyProbe.features], fixture: JSON.stringify({ probe: historyProbe, css: historyCss, reference: historyReference, states: historyStates }), expectation: { support: 'supported', stage: 'runtime' }, requiredAssertions: names, expectedValues: expected, assertionStages: { generated: 'generation', ...Object.fromEntries(names.filter(name => name.includes('/pixel/')).map(name => [name, 'visual' as const])) } }
}

function validOrigin(origin: string) {
  try {
    const url = new URL(origin)
    return url.protocol === 'http:' && url.hostname === '127.0.0.1' && Number(url.port) > 0 && url.origin === origin
  }
  catch { return false }
}

/** 隐私掩蔽的 computed 和 matches 只归档；绘制必须与独立颜色合同一致。 */
export function historyAssertions(raw: HistorySidecar, screenshots: ReadonlyMap<string, Buffer>, cssHash: string, engine: BrowserEngine, runId: string): SemanticAssertion[] {
  const contract = historyContract(runId)
  const paths = historyPaths(runId)
  const fixtureUrl = raw.origin + paths.fixture
  const target = raw.origin + paths.target
  const click = raw.navigation[0]
  const back = raw.navigation[1]
  const initial = raw.states.find(state => state.name === 'initial')
  const visited = raw.states.find(state => state.name === 'visited')
  const restored = raw.states.find(state => state.name === 'restored')
  const targetRequest = raw.requests.find(request => request.path === paths.target)
  const sequence = [initial?.sequence, targetRequest?.sequence, click?.sequence, back?.sequence, visited?.sequence, restored?.sequence]
  const values: Record<string, SemanticAssertion['actual'] | undefined> = {
    'generated': raw.generation?.cssHash === cssHash && raw.generation.candidates.includes(historyProbe.candidate),
    'states/order': digest(raw.states.map(state => state.name)) === digest(historyStates),
    'navigation/real-history': raw.navigation.length === 2 && click?.action === 'click' && click.from === fixtureUrl && click.to === target && click.status === 200 && click.mainFrame && click.trusted === true && click.href === target && click.profileId === initial?.profileId && back?.action === 'back' && back.profileId === initial?.profileId && back.from === target && back.to === fixtureUrl && (back.status === null || back.status === 200) && back.mainFrame,
    'navigation/sequence': sequence.every((value, index) => Number.isInteger(value) && value! > 0 && (!index || value! > sequence[index - 1]!)) && Number.isInteger(click?.eventSequence) && click!.eventSequence! > initial!.sequence && click!.eventSequence! < click!.sequence,
    'server/requests': !raw.requests.some(request => ![paths.fixture, paths.target].includes(request.path) || request.status !== 200 || request.method !== 'GET') && raw.requests.filter(request => request.path === paths.target).length === 1 && raw.requests.filter(request => request.path === paths.fixture).length >= 2 && raw.requests.every((request, index) => Number.isInteger(request.sequence) && request.sequence > 0 && (!index || request.sequence > raw.requests[index - 1]!.sequence)),
    'profiles/independent': raw.profiles.length === 2 && new Set(raw.profiles.map(profile => profile.directory)).size === 2 && new Set(raw.profiles.map(profile => profile.id)).size === 2 && raw.profiles.every((profile, index) => profile.name === (index ? 'fresh' : 'history') && profile.id === digest({ runId, engine, directory: profile.directory }) && (path.posix.isAbsolute(profile.directory) || path.win32.isAbsolute(profile.directory)) && profile.browserType === engine && profile.persistent === true && profile.headless === true && profile.channel === (engine === 'chromium' ? 'chromium' : 'default') && Boolean(profile.executable) && profile.created === true && profile.closed === true && profile.removed === true),
    'profiles/lifecycle': digest(raw.lifecycle) === digest(['history:created', 'history:launched', 'initial:captured', 'history:click', 'history:back', 'visited:captured', 'history:closed', 'history:removed', 'fresh:created', 'fresh:launched', 'restored:captured', 'fresh:closed', 'fresh:removed']),
    'cleanup/profiles': digest(raw.cleanup.closedProfiles) === digest(['history', 'fresh']) && digest(raw.cleanup.removedProfiles) === digest(['history', 'fresh']),
    'cleanup/server': raw.cleanup.serverClosed,
    'cleanup/no-errors': raw.cleanup.errors.length === 0,
  }
  for (const name of historyStates) {
    const matching = raw.states.filter(state => state.name === name)
    if (matching.length !== 1) {
      continue
    }
    const state = matching[0]!
    const profile = raw.profiles.find(profile => profile.name === (name === 'restored' ? 'fresh' : 'history'))
    Object.assign(values, { [`${name}/fixture/id`]: state.id, [`${name}/fixture/run-id`]: state.runId, [`${name}/fixture/same-origin`]: validOrigin(raw.origin) && state.origin === raw.origin && state.topOrigin === raw.origin, [`${name}/fixture/url`]: state.url === fixtureUrl, [`${name}/profile`]: state.profileId === profile?.id ? state.profile : null, [`${name}/frames`]: state.frames.length === 2 && state.frames.every(Number.isFinite) && state.frames[1]! > state.frames[0]! })
    const bytes = state.screenshot === `${historyProbe.id}-${name}.png` ? screenshots.get(state.screenshot) : undefined
    if (bytes) {
      const colors = historyIdentity(runId, name, cssHash, engine)
      const pixels = readPixels(bytes, { left: 24, top: 160, width: 32, height: 4 }, colors.map((_, index) => ({ id: `identity-${index}`, x: (index + 0.5) / 8, y: 0.5, expected: [0, 0, 0, 0], tolerance: 0 })))
      values[`${name}/pixel/identity`] = pixels.every((pixel, index) => digest(pixel.rgba) === digest([...colors[index]!, 255]))
    }
    for (const id of historyElements) {
      const link = state.links[id]
      values[`${name}/${id}/href`] = link?.href === (id === 'control' ? raw.origin + paths.control : target)
      values[`${name}/${id}/width`] = link?.borderWidth
      values[`${name}/${id}/style`] = link?.borderStyle
      for (const field of ['left', 'top', 'width', 'height'] as const) {
        values[`${name}/${id}/rect/${field}`] = link?.rect[field]
      }
      if (bytes && link && Object.values(link.rect).every(Number.isFinite) && link.rect.width > 0 && link.rect.height > 0) {
        const samples = [{ id: 'top', x: 0.5, y: 0.1 }, { id: 'right', x: 0.975, y: 0.5 }, { id: 'bottom', x: 0.5, y: 0.9 }, { id: 'left', x: 0.025, y: 0.5 }]
        const pixels = readPixels(bytes, link.rect, samples.map(sample => ({ ...sample, expected: [0, 0, 0, 0], tolerance: 0 })))
        for (const pixel of pixels) {
          for (const [channel, key] of rgbaChannels.entries()) {
            values[`${name}/${id}/pixel/${pixel.id}/${key}`] = pixel.rgba[channel]
          }
        }
      }
    }
  }
  return contract.requiredAssertions.map(name => ({ name, stage: contract.assertionStages?.[name] ?? 'runtime', actual: values[name] ?? null, expected: contract.expectedValues[name]! }))
}
