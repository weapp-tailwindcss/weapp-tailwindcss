import type { Buffer } from 'node:buffer'
import type { MediaObservation } from './types'
import { PNG } from 'pngjs'
import { digest } from '../identity'
import { mediaValue, nativeMediaElements, nativeMediaProbe, nativeMediaQueries, nativeMediaStates, nativeMediaUrl } from './fixtures'
import { identityColors } from './identity'
import { contrastParameters } from './native'

/** 合成证据仅用于拒绝错误输入的单测，不作为浏览器执行证据。 */
export function syntheticMedia(runId = 'unit-media', cssHash = digest('/* 合成数据只验证重放门禁 */')) {
  const screenshots = new Map<string, Buffer>()
  const observation: MediaObservation = { states: [], cleanup: { detached: true, errors: [], reset: { method: 'Emulation.setEmulatedMedia', params: { media: '', features: [] }, response: {} } } }
  nativeMediaStates.forEach((name, index) => {
    const screenshot = `${nativeMediaProbe.id}-${name}.png`
    const png = new PNG({ width: 640, height: 480 })
    const rects = Object.fromEntries(nativeMediaElements.map((id, i) => [id, { left: 24, top: 24 + 40 * i, width: 160, height: 40 }]))
    const backgrounds: Record<string, string> = {}
    for (const id of nativeMediaElements) {
      const active = name === 'less' && id !== 'control'
      const rgba = active ? [18, 52, 86, 255] : [1, 2, 3, 255]
      backgrounds[id] = active ? 'rgb(18, 52, 86)' : 'rgb(1, 2, 3)'
      const rect = rects[id]!
      png.data.set(rgba, ((rect.top + 20) * 640 + rect.left + 80) * 4)
    }
    identityColors(runId, name, cssHash).forEach((color, i) => png.data.set([...color, 255], (162 * 640 + 24 + i * 4 + 2) * 4))
    screenshots.set(screenshot, PNG.sync.write(png))
    observation.states.push({ name, command: { method: 'Emulation.setEmulatedMedia', params: contrastParameters(mediaValue(name)), response: {} }, id: nativeMediaProbe.id, runId, url: nativeMediaUrl(runId), frames: [index * 3 + 1, index * 3 + 2], queries: Object.fromEntries(nativeMediaQueries.map(query => [query, query === mediaValue(name)])), backgrounds, rects, screenshot })
  })
  return { observation, screenshots, runId, cssHash }
}
