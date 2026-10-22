import type { Buffer } from 'node:buffer'
import type { BrowserEngine } from '../types'
import type { HistorySidecar } from './types'
import { PNG } from 'pngjs'
import { digest } from '../identity'
import { historyElements, historyIdentity, historyObservation, historyPaths, historyProbe, historyScreenshot, historyStates, historyToken } from './fixtures'

/** 合成回执只用于拒绝错误证据的单测，不能登记为浏览器能力结果。 */
export function syntheticHistory(runId = 'unit-history', engine: BrowserEngine = 'chromium', css = '/* 合成数据只验证历史重放门禁 */') {
  const cssHash = digest(css)
  const origin = 'http://127.0.0.1:43210'
  const paths = historyPaths(runId)
  const profiles = (['history', 'fresh'] as const).map(name => ({ name, id: digest({ runId, engine, directory: `/unit-history/${name}` }), directory: `/unit-history/${name}`, browserType: engine, persistent: true as const, headless: true as const, channel: engine === 'chromium' ? 'chromium' as const : 'default' as const, executable: '/unit-browser', created: true, closed: true, removed: true }))
  const raw: HistorySidecar = { schemaVersion: 3, id: `runtime/${historyProbe.id}`, runId, engine, browserVersion: 'unit-browser', origin, generation: { candidates: [historyProbe.candidate], cssHash }, profiles, lifecycle: ['history:created', 'history:launched', 'initial:captured', 'history:click', 'history:back', 'visited:captured', 'history:closed', 'history:removed', 'fresh:created', 'fresh:launched', 'restored:captured', 'fresh:closed', 'fresh:removed'], states: [], navigation: [
    { action: 'click', profileId: profiles[0]!.id, eventSequence: 3, sequence: 5, from: origin + paths.fixture, to: origin + paths.target, status: 200, mainFrame: true, trusted: true, href: origin + paths.target },
    { action: 'back', profileId: profiles[0]!.id, sequence: 6, from: origin + paths.target, to: origin + paths.fixture, status: null, mainFrame: true },
  ], requests: [{ path: paths.fixture, method: 'GET', status: 200, sequence: 1 }, { path: paths.target, method: 'GET', status: 200, sequence: 4 }, { path: paths.fixture, method: 'GET', status: 200, sequence: 8 }], cleanup: { closedProfiles: ['history', 'fresh'], removedProfiles: ['history', 'fresh'], serverClosed: true, errors: [] }, warnings: [], observationFailures: [] }
  const screenshots = new Map<string, Buffer>()
  for (const [index, name] of historyStates.entries()) {
    const png = new PNG({ width: 640, height: 480 })
    const links: typeof raw.states[number]['links'] = {}
    for (const [i, id] of historyElements.entries()) {
      const rect = { left: 24, top: 24 + i * 40, width: 160, height: 40 }
      links[id] = { href: origin + (id === 'control' ? paths.control : paths.target), computed: 'rgb(1, 2, 3)', matchesVisited: false, borderWidth: '8px', borderStyle: 'solid', rect }
      const color = name === 'visited' && id !== 'control' ? [18, 52, 86, 255] : [1, 2, 3, 255]
      for (let y = rect.top; y < rect.top + rect.height; y++) {
        for (let x = rect.left; x < rect.left + rect.width; x++) {
          if (y < rect.top + 8 || y >= rect.top + 32 || x < rect.left + 8 || x >= rect.left + 152) {
            png.data.set(color, (y * png.width + x) * 4)
          }
        }
      }
    }
    historyIdentity(runId, historyToken(name, 1), cssHash, engine, profiles[name === 'restored' ? 1 : 0]!.id).forEach((color, i) => png.data.set([...color, 255], (162 * 640 + 24 + i * 4 + 2) * 4))
    const screenshot = historyScreenshot(name, 1)
    screenshots.set(screenshot, PNG.sync.write(png))
    raw.states.push({ name, profile: name === 'restored' ? 'fresh' : 'history', profileId: profiles[name === 'restored' ? 1 : 0]!.id, sequence: [2, 7, 9][index]!, id: historyProbe.id, runId, url: origin + paths.fixture, origin, topOrigin: origin, frames: [1, 2], timeOrigin: 1_700_000_000_000, links, screenshot })
  }
  const visited = raw.states[1]!
  visited.observation = { ...historyObservation, elapsedMs: 21, samples: [{ ...visited, attempt: 1, startedMs: 0, elapsedMs: 20 }] }
  return { raw, screenshots, cssHash, runId, engine, css }
}

/** 首张未绘制、第二张达成的原图轨迹，用于离线门禁的反例回归。 */
export function deferredHistory(fixture = syntheticHistory()) {
  const { raw, screenshots, runId, engine, cssHash } = fixture
  const visited = raw.states[1]!
  const first = visited.observation!.samples[0]!
  const finalPng = PNG.sync.read(screenshots.get(first.screenshot)!)
  const stale = PNG.sync.read(screenshots.get(first.screenshot)!)
  for (const id of ['probe', 'reference']) {
    const rect = first.links[id]!.rect
    for (let y = rect.top; y < rect.top + rect.height; y++) {
      for (let x = rect.left; x < rect.left + rect.width; x++) {
        stale.data.set([1, 2, 3, 255], (y * stale.width + x) * 4)
      }
    }
  }
  screenshots.set(first.screenshot, PNG.sync.write(stale))
  historyIdentity(runId, historyToken('visited', 2), cssHash, engine, visited.profileId)
    .forEach((color, i) => finalPng.data.set([...color, 255], (162 * finalPng.width + 24 + i * 4 + 2) * 4))
  visited.screenshot = historyScreenshot('visited', 2)
  visited.sequence = 8
  screenshots.set(visited.screenshot, PNG.sync.write(finalPng))
  const { observation: _trace, ...snapshot } = visited
  visited.frames = [3, 4]
  visited.observation = { ...historyObservation, elapsedMs: 141, samples: [first, { ...snapshot, frames: [3, 4], attempt: 2, startedMs: 120, elapsedMs: 140 }] }
  raw.requests[2]!.sequence = 9
  raw.states[2]!.sequence = 10
  return fixture
}
