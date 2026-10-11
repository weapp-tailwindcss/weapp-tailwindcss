import type { NativeVisualProbe } from '../examples/react-native-expo/src/visual-probes'
import { expect, it } from 'vitest'
import { androidScreenProbes } from './react-native/android-window'

const probe: NativeVisualProbe = { id: 'tsx-hmr', bounds: { x: 16, y: 196 / 2.75, width: 180, height: 24 }, rgb: [0, 188, 125] }
const xml = '<node package="com.weapptailwindcss.rncompat" resource-id="tw-rn-hmr" content-desc="rn-hmr-baseline" bounds="[44,341][539,407]" />'

it('maps Android window coordinates to current screen bounds without assuming a status bar height', () => {
  const [screen] = androidScreenProbes(xml, [probe], 2.75, 'rn-hmr-baseline', '#10b981')
  expect(screen?.bounds).toEqual({ x: 16, y: 124, width: 180, height: 24 })
  expect(screen?.rgb).toEqual(probe.rgb)
  const shifted = xml.replace('[44,341][539,407]', '[71,200][566,266]')
  expect(androidScreenProbes(shifted, [probe], 2.75, 'rn-hmr-baseline', '#10b981')[0]?.bounds.y).toBe(200 / 2.75)
})

it('rejects stale markers, foreign windows, duplicates and clipped probe dimensions', () => {
  for (const invalid of [xml.replace('rn-hmr-baseline', 'rn-hmr-old'), xml.replace('rncompat', 'other'), xml + xml, xml.replace('539,407', '539,380'), '']) {
    expect(() => androidScreenProbes(invalid, [probe], 2.75, 'rn-hmr-baseline', '#10b981')).toThrow()
  }
  expect(() => androidScreenProbes(xml, [probe], 0, 'rn-hmr-baseline', '#10b981')).toThrow()
})
