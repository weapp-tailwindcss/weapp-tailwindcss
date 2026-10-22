import type { ThemeOverrideFrame } from '../../examples/react-lynx/src/compatibility/theme-overrides-contract'
import type { NativeEvidenceContext, NativeGeometryEvidence, NativePlatformReport, NativeRect } from '../../examples/react-lynx/src/compatibility/types'
import fs from 'node:fs/promises'
import path from 'node:path'
import { themeOverrideContract as contract, validateThemeOverrideEvidence } from '../../examples/react-lynx/src/compatibility/theme-overrides-contract'
import { readHostGeometry } from './geometry-evidence'
import { PNG } from './png'

function validateGeometry(geometry: NativeGeometryEvidence, frame: ThemeOverrideFrame) {
  function rectangle(actual: NativeRect, container: NativeRect, left: number, top: number, width: number, height: number) {
    const actualValues = [actual.left - container.left, actual.top - container.top, actual.width, actual.height]
    if (actualValues.some((value, index) => Math.abs(value - [left, top, width, height][index]!) > 0.5)) {
      throw new Error(`主题覆盖宿主几何不符合独立夹具：${frame.id}`)
    }
  }
  for (const side of ['probe', 'control'] as const) {
    const container = geometry[`${side}Container`]
    rectangle(container, container, 0, 0, 80, 80)
    rectangle(geometry[side], container, 8, 8, 64, 64)
    rectangle(geometry[`${side}Child`], container, 8, 8, contract.markerWidths[frame.phase], 8)
  }
}

/** 逐物理像素核对独立颜色和白色标尺；只豁免一物理像素的理论边界。 */
export async function validateThemeOverrideArtifacts(report: NativePlatformReport, directory: string, expected: NativeEvidenceContext) {
  validateThemeOverrideEvidence(report.themeOverrides)
  for (const frame of report.themeOverrides.frames) {
    const geometry = await readHostGeometry(report, directory, expected, frame.id, frame.geometry)
    validateGeometry(geometry, frame)
    const scale = report.environment.viewport.pixelRatio
    const rgb = frame.phase === 'after' ? contract.changedColor : contract.colors[frame.branch]
    for (const side of ['probe', 'control'] as const) {
      const image = PNG.sync.read(await fs.readFile(path.join(directory, `${frame.id}-geometry-${side}.png`)))
      const edgesX = [0, 8, 8 + contract.markerWidths[frame.phase], 72, 80].map(value => value * scale)
      const edgesY = [0, 8, 16, 72, 80].map(value => value * scale)
      let colored = 0
      let white = 0
      for (let y = 0; y < image.height; y++) {
        for (let x = 0; x < image.width; x++) {
          if (edgesX.some(edge => Math.abs(x + 0.5 - edge) <= 1) || edgesY.some(edge => Math.abs(y + 0.5 - edge) <= 1)) {
            continue
          }
          const inside = x + 0.5 > 8 * scale && x + 0.5 < 72 * scale && y + 0.5 > 8 * scale && y + 0.5 < 72 * scale
          const marker = inside && x + 0.5 < (8 + contract.markerWidths[frame.phase]) * scale && y + 0.5 < 16 * scale
          const color = inside && !marker ? rgb : [255, 255, 255]
          const offset = (y * image.width + x) * 4
          if (image.data[offset + 3] !== 255 || color.some((channel, index) => Math.abs(image.data[offset + index]! - channel) > 2)) {
            throw new Error(`主题覆盖像素不符合独立期望：${frame.id}/${side}/${x},${y}`)
          }
          if (inside && !marker) {
            colored++
          }
          else {
            white++
          }
        }
      }
      if (colored < 3000 * scale * scale || white < 1000 * scale * scale) {
        throw new Error(`主题覆盖像素有效面积不足：${frame.id}/${side}`)
      }
    }
  }
}
