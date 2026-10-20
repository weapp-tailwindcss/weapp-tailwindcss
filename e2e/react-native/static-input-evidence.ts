import type { NativeStyleManifest } from '../../packages/react-native/src/types'
import type { NativeAuthoringEvidence } from './authoring-evidence'
import type { RuntimeStyleInput, SourceReceipt } from './generation-input'
import { isDeepStrictEqual } from 'node:util'
import { addNativeVariantRules, compileNativeStylesheet, finalizeNativeManifest } from '../../packages/react-native/src/compiler'
import { validateAuthoringEvidence } from './authoring-evidence'
import { RN_FIXTURE_HASH } from './catalog'
import { exampleRoot, readRuntimeStyleInput, RN_ENTRY_SCOPE_VERSION, sameArchivedValue } from './generation-input'
import { validateImportantRuntimeManifest } from './important-runtime'

export interface StaticGenerationInput {
  schemaVersion: number
  fixtureHash: string
  rawCss: string
  manifest: NativeStyleManifest
  generation: {
    version: number
    runtimeInput: { options: RuntimeStyleInput, config: SourceReceipt }
    authoring: NativeAuthoringEvidence
  }
}

/** 归档的 static 模块必须匹配本轮入口合同，并以各自 CSS 独立重算 manifest。 */
export async function validateStaticGenerationInput(value: StaticGenerationInput, projectRoot = exampleRoot) {
  if (value?.schemaVersion !== 2 || value.fixtureHash !== RN_FIXTURE_HASH || value.generation?.version !== RN_ENTRY_SCOPE_VERSION
    || !isDeepStrictEqual(value.generation.runtimeInput, await readRuntimeStyleInput(projectRoot))) {
    throw new Error('React Native static 输入缺少当前独立入口合同或配置身份')
  }
  const replay = compileNativeStylesheet(value.rawCss)
  addNativeVariantRules(replay, value.manifest.classSet)
  finalizeNativeManifest(replay)
  if (!sameArchivedValue(replay, value.manifest)) {
    throw new Error('React Native static 主 CSS 与归档 manifest 不符')
  }
  validateImportantRuntimeManifest(value.manifest)
  await validateAuthoringEvidence(value.generation.authoring, projectRoot)
}
