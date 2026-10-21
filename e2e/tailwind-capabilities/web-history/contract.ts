import type { Buffer } from 'node:buffer'
import type { BrowserEngine, CaseContract, SemanticAssertion } from '../types'
import type { HistorySidecar } from './types'
import path from 'node:path'
import { digest } from '../identity'
import { assertionPassed } from '../report'
import { rgbaChannels } from '../web/pixels'
import { historyCss, historyElements, historyObservation, historyPaths, historyProbe, historyReference, historyScreenshot, historyStates, historyToken } from './fixtures'
import { historySampleAssertions, historySnapshotValues } from './snapshot'

export function historyContract(runId: string): CaseContract {
  const expected: CaseContract['expectedValues'] = { 'generated': true, 'states/order': true, 'navigation/real-history': true, 'navigation/sequence': true, 'server/requests': true, 'server/observation-sequence': true, 'profiles/independent': true, 'profiles/lifecycle': true, 'cleanup/profiles': true, 'cleanup/server': true, 'cleanup/no-errors': true, 'visited/observation/policy': true, 'visited/observation/trace': true, 'visited/observation/evidence': true, 'visited/observation/no-errors': true }
  for (const state of historyStates) {
    Object.assign(expected, { [`${state}/fixture/id`]: historyProbe.id, [`${state}/fixture/run-id`]: runId, [`${state}/fixture/same-origin`]: true, [`${state}/fixture/url`]: true, [`${state}/profile`]: state === 'restored' ? 'fresh' : 'history', [`${state}/frames`]: true, [`${state}/clock`]: true, [`${state}/pixel/identity`]: true })
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
  return { id: `runtime/${historyProbe.id}`, candidate: historyProbe.candidate, features: [...historyProbe.features], fixture: JSON.stringify({ probe: historyProbe, css: historyCss, reference: historyReference, states: historyStates, observation: historyObservation }), expectation: { support: 'supported', stage: 'runtime' }, requiredAssertions: names, expectedValues: expected, assertionStages: { generated: 'generation', ...Object.fromEntries(names.filter(name => name.includes('/pixel/')).map(name => [name, 'visual' as const])) } }
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
  const fixtureRequests = raw.requests.filter(request => request.path === paths.fixture)
  const traceSamples = visited?.observation?.samples ?? []
  const allSequences = [initial?.sequence, ...traceSamples.map(sample => sample.sequence), restored?.sequence, ...raw.navigation.map(event => event.sequence), click?.eventSequence, ...raw.requests.map(request => request.sequence)]
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
    'visited/observation/no-errors': raw.observationFailures.length === 0,
    'server/observation-sequence': Boolean(initial && visited && restored && click && back && [2, 3].includes(fixtureRequests.length) && fixtureRequests[0]!.sequence < initial.sequence && fixtureRequests.at(-1)!.sequence > visited.sequence && fixtureRequests.at(-1)!.sequence < restored.sequence && (fixtureRequests.length === 2 || (fixtureRequests[1]!.sequence > click.sequence && fixtureRequests[1]!.sequence < back.sequence)) && allSequences.every(value => Number.isInteger(value) && value! > 0) && new Set(allSequences).size === allSequences.length),
  }
  for (const name of historyStates) {
    const matching = raw.states.filter(state => state.name === name)
    if (matching.length !== 1) {
      continue
    }
    const state = matching[0]!
    const profile = raw.profiles.find(profile => profile.name === (name === 'restored' ? 'fresh' : 'history'))
    const sample = state.observation?.samples.at(-1)
    const token = historyToken(name, sample?.attempt)
    const expectedFile = historyScreenshot(name, sample?.attempt)
    Object.assign(values, historySnapshotValues(state, state.screenshot === expectedFile ? screenshots.get(state.screenshot) : undefined, token, cssHash, engine, runId, raw.origin, profile?.id))
  }
  const trace = visited?.observation
  const samples = trace?.samples
  values['visited/observation/policy'] = trace?.budgetMs === historyObservation.budgetMs && trace.intervalMs === historyObservation.intervalMs && Number.isFinite(trace.elapsedMs) && trace.elapsedMs >= 0 && trace.elapsedMs <= historyObservation.budgetMs
  values['visited/observation/trace'] = Array.isArray(samples) && samples.length > 0 && samples.length <= Math.ceil(historyObservation.budgetMs / historyObservation.intervalMs) + 1 && samples.every((sample, index) => sample.name === 'visited' && sample.attempt === index + 1 && sample.screenshot === historyScreenshot('visited', index + 1) && Number.isFinite(sample.startedMs) && Number.isFinite(sample.elapsedMs) && sample.startedMs >= 0 && sample.elapsedMs >= sample.startedMs && sample.elapsedMs <= trace!.elapsedMs && sample.elapsedMs <= historyObservation.budgetMs && sample.sequence > (index ? samples[index - 1]!.sequence : back?.sequence ?? Infinity) && (!index || (sample.startedMs >= samples[index - 1]!.elapsedMs + historyObservation.intervalMs && sample.frames[0]! > samples[index - 1]!.frames[1]! && sample.timeOrigin === samples[0]!.timeOrigin))) && digest({ ...samples.at(-1), attempt: undefined, startedMs: undefined, elapsedMs: undefined }) === digest({ ...visited, observation: undefined })
  values['visited/observation/evidence'] = Array.isArray(samples) && samples.length > 0 && samples.every((sample, index) => {
    const token = historyToken('visited', index + 1)
    const bytes = sample.screenshot === historyScreenshot('visited', index + 1) ? screenshots.get(sample.screenshot) : undefined
    const sampleValues = historySnapshotValues(sample, bytes, token, cssHash, engine, runId, raw.origin, initial?.profileId)
    const invariant = historySampleAssertions(sampleValues, contract.expectedValues, true).every(assertionPassed)
    const ready = historySampleAssertions(sampleValues, contract.expectedValues).every(assertionPassed)
    return invariant && (index === samples.length - 1 ? ready : !ready)
  })
  return contract.requiredAssertions.map(name => ({ name, stage: contract.assertionStages?.[name] ?? 'runtime', actual: values[name] ?? null, expected: contract.expectedValues[name]! }))
}
