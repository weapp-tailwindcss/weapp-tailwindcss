import type { NativeGeometryEvidence } from './types'
import { geometryArtifactNames, validNativeGeometry } from './native-geometry'

export const themeOverrideContract = {
  id: 'lynx-theme-overrides-v1',
  phases: ['before', 'after', 'restored'],
  branches: ['tailwind-hex', 'application-hex', 'application-oklch'],
  markerWidths: { before: 16, after: 24, restored: 32 },
  colors: { 'tailwind-hex': [255, 0, 0], 'application-hex': [255, 0, 0], 'application-oklch': [230, 80, 0] },
  changedColor: [0, 0, 255],
} as const

export type ThemeOverridePhase = typeof themeOverrideContract.phases[number]
export type ThemeOverrideBranch = typeof themeOverrideContract.branches[number]
export interface ThemeOverrideFrame {
  phase: ThemeOverridePhase
  branch: ThemeOverrideBranch
  id: string
  geometry: NativeGeometryEvidence
}
export interface ThemeOverrideEvidence {
  contract: string
  frames: ThemeOverrideFrame[]
}

export function themeOverrideId(branch: ThemeOverrideBranch, phase: ThemeOverridePhase) {
  return `theme-${branch}-${phase}`
}

export function themeOverrideArtifactNames() {
  return themeOverrideContract.phases.flatMap(phase => themeOverrideContract.branches.flatMap(branch => geometryArtifactNames(themeOverrideId(branch, phase))))
}

/** 固定三分支及完整状态序列；历史报告缺证不得升级为当前验收成功。 */
export function validateThemeOverrideEvidence(value: ThemeOverrideEvidence | undefined): asserts value is ThemeOverrideEvidence {
  const expected = themeOverrideContract.phases.flatMap(phase => themeOverrideContract.branches.map(branch => ({ phase, branch, id: themeOverrideId(branch, phase) })))
  if (value?.contract !== themeOverrideContract.id || !Array.isArray(value.frames) || value.frames.length !== expected.length
    || expected.some((frame, index) => {
      const actual = value.frames[index]
      return !actual || actual.id !== frame.id || actual.phase !== frame.phase || actual.branch !== frame.branch || !validNativeGeometry(actual.geometry)
    })) {
    throw new Error('主题覆盖缺少完整、唯一的本轮三分支切换及恢复证据')
  }
}
