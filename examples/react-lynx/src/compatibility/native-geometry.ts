import type { NativeArtifactReceipt, NativeGeometryEvidence, NativeRect } from './types'

export interface NativeGeometryCapture {
  geometry: NativeGeometryEvidence
  artifacts: NativeArtifactReceipt[]
}

export const geometryFields = ['probe', 'control', 'probeContainer', 'controlContainer', 'probeChild', 'controlChild'] as const
const rectFields = ['left', 'top', 'right', 'bottom', 'width', 'height'] as const

export function geometryArtifactNames(id: string) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) {
    throw new Error('原生几何 case ID 无效')
  }
  return [`${id}-geometry-probe.png`, `${id}-geometry-control.png`, `${id}-geometry.json`]
}

/** 宿主测量必须包含有限、非空且角点一致的六个矩形。 */
export function validNativeGeometry(value: unknown): value is NativeGeometryEvidence {
  if (!value || typeof value !== 'object' || Object.keys(value).length !== geometryFields.length) {
    return false
  }
  return geometryFields.every((field) => {
    const rect = (value as NativeGeometryEvidence)[field] as NativeRect | undefined
    return rect && rectFields.every(key => Number.isFinite(rect[key])) && rect.width > 0 && rect.height > 0
      && Math.abs(rect.right - rect.left - rect.width) <= 0.01 && Math.abs(rect.bottom - rect.top - rect.height) <= 0.01
  })
}
