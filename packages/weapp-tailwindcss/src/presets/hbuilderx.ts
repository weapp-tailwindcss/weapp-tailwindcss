import type { BasePresetOptions } from './shared'
import { createBasePreset, withWebCompatGeneratorDefaults } from './shared'

export interface HBuilderXOptions extends BasePresetOptions {}

export function hbuilderx(options: HBuilderXOptions = {}) {
  return createBasePreset(withWebCompatGeneratorDefaults({
    appType: 'uni-app-vite' as const,
    ...options,
  }))
}
