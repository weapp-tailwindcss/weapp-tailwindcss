import type { HBuilderXRuntimeHints as FrameworkHBuilderXRuntimeHints } from '@weapp-tailwindcss/env'
import { isRunningInHBuilderX as detectRunningInHBuilderX } from '@weapp-tailwindcss/env'

export type HBuilderXRuntimeHints = Pick<FrameworkHBuilderXRuntimeHints, 'cwd' | 'nodePath'>

export function isRunningInHBuilderX(options: HBuilderXRuntimeHints = {}) {
  return detectRunningInHBuilderX(options)
}
