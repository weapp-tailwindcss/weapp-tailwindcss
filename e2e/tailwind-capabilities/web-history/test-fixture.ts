import type { Buffer } from 'node:buffer'
import type { BrowserEngine } from '../types'
import type { HistorySidecar } from './types'
import { PNG } from 'pngjs'
import { digest } from '../identity'
import { historyElements, historyIdentity, historyPaths, historyProbe, historyStates } from './fixtures'

/** 合成回执只用于拒绝错误证据的单测，不能登记为浏览器能力结果。 */
export function syntheticHistory(runId = 'unit-history', engine: BrowserEngine = 'chromium', css = '/* 合成数据只验证历史重放门禁 */') {
  const cssHash = digest(css)
  const origin = 'http://127.0.0.1:43210'
  const paths = historyPaths(runId)
  const profiles = (['history', 'fresh'] as const).map(name => ({ name, id: digest({ runId, engine, directory: `/unit-history/${name}` }), directory: `/unit-history/${name}`, browserType: engine, persistent: true as const, headless: true as const, channel: engine === 'chromium' ? 'chromium' as const : 'default' as const, executable: '/unit-browser', created: true, closed: true, removed: true }))
  const raw: HistorySidecar = { schemaVersion: 2, id: `runtime/${historyProbe.id}`, runId, engine, browserVersion: 'unit-browser', origin, generation: { candidates: [historyProbe.candidate], cssHash }, profiles, lifecycle: ['history:created', 'history:launched', 'initial:captured', 'history:click', 'history:back', 'visited:captured', 'history:closed', 'history:removed', 'fresh:created', 'fresh:launched', 'restored:captured', 'fresh:closed', 'fresh:removed'], states: [], navigation: [
    { action: 'click', profileId: profiles[0]!.id, eventSequence: 3, sequence: 5, from: origin + paths.fixture, to: origin + paths.target, status: 200, mainFrame: true, trusted: true, href: origin + paths.target },
    { action: 'back', profileId: profiles[0]!.id, sequence: 6, from: origin + paths.target, to: origin + paths.fixture, status: null, mainFrame: true },
  ], requests: [{ path: paths.fixture, method: 'GET', status: 200, sequence: 1 }, { path: paths.target, method: 'GET', status: 200, sequence: 4 }, { path: paths.fixture, method: 'GET', status: 200, sequence: 8 }], cleanup: { closedProfiles: ['history', 'fresh'], removedProfiles: ['history', 'fresh'], serverClosed: true, errors: [] }, warnings: [] }
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
    historyIdentity(runId, name, cssHash, engine).forEach((color, i) => png.data.set([...color, 255], (162 * 640 + 24 + i * 4 + 2) * 4))
    const screenshot = `${historyProbe.id}-${name}.png`
    screenshots.set(screenshot, PNG.sync.write(png))
    raw.states.push({ name, profile: name === 'restored' ? 'fresh' : 'history', profileId: profiles[name === 'restored' ? 1 : 0]!.id, sequence: [2, 7, 9][index]!, id: historyProbe.id, runId, url: origin + paths.fixture, origin, topOrigin: origin, frames: [1, 2], links, screenshot })
  }
  return { raw, screenshots, cssHash, runId, engine, css }
}
