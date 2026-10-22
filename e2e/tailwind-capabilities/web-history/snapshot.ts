import type { Buffer } from 'node:buffer'
import type { BrowserEngine, SemanticAssertion } from '../types'
import type { HistorySnapshot } from './types'
import { digest } from '../identity'
import { readPixels, rgbaChannels } from '../web/pixels'
import { historyElements, historyIdentity, historyPaths } from './fixtures'

function validOrigin(origin: string) {
  try {
    const url = new URL(origin)
    return url.protocol === 'http:' && url.hostname === '127.0.0.1' && Number(url.port) > 0 && url.origin === origin
  }
  catch { return false }
}

/** 每张原图均独立核对夹具身份、几何和四边；computed 与 matches 不参与判定。 */
export function historySnapshotValues(state: HistorySnapshot, bytes: Buffer | undefined, token: string, cssHash: string, engine: BrowserEngine, runId: string, origin: string, profileId: string | undefined) {
  const { name } = state
  const paths = historyPaths(runId)
  const values: Record<string, SemanticAssertion['actual'] | undefined> = {
    [`${name}/fixture/id`]: state.id,
    [`${name}/fixture/run-id`]: state.runId,
    [`${name}/fixture/same-origin`]: validOrigin(origin) && state.origin === origin && state.topOrigin === origin,
    [`${name}/fixture/url`]: state.url === origin + paths.fixture,
    [`${name}/profile`]: state.profileId === profileId ? state.profile : null,
    [`${name}/frames`]: state.frames.length === 2 && state.frames.every(Number.isFinite) && state.frames[1]! > state.frames[0]!,
    [`${name}/clock`]: Number.isFinite(state.timeOrigin) && state.timeOrigin > 0,
  }
  if (bytes) {
    const colors = historyIdentity(runId, token, cssHash, engine, state.profileId)
    const pixels = readPixels(bytes, { left: 24, top: 160, width: 32, height: 4 }, colors.map((_, index) => ({ id: `identity-${index}`, x: (index + 0.5) / 8, y: 0.5, expected: [0, 0, 0, 0], tolerance: 0 })))
    values[`${name}/pixel/identity`] = pixels.every((pixel, index) => digest(pixel.rgba) === digest([...colors[index]!, 255]))
  }
  for (const id of historyElements) {
    const link = state.links[id]
    values[`${name}/${id}/href`] = link?.href === origin + (id === 'control' ? paths.control : paths.target)
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
  return values
}

export function historySampleAssertions(values: ReturnType<typeof historySnapshotValues>, expected: Record<string, SemanticAssertion['expected']>, invariantOnly = false) {
  return Object.keys(expected).filter(name => name.startsWith('visited/') && !name.startsWith('visited/observation/')
    && (!invariantOnly || !/^visited\/(?:probe|reference)\/pixel\//.test(name))).map(name => ({ name, stage: 'visual' as const, actual: values[name] ?? null, expected: expected[name]! }))
}
