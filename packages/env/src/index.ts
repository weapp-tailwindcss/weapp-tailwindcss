export { detectAppTypeFromEnv } from './detect-env'
export { isRunningInHBuilderX } from './hbuilderx'
export {
  detectAppTypeFromPackageJson,
  isMpxPackage,
  isTaroPackage,
  isUniAppPackage,
  isUniAppVitePackage,
  isUniAppXManifest,
  isUniAppXPackage,
  isWeappVitePackage,
} from './package'
export {
  normalizeFrameworkStylePlatform,
  resolveMpxPlatform,
  resolveMpxPlatformFromEnv,
  resolvePlatform,
  resolveTaroPlatform,
  resolveTaroPlatformFromEnv,
  resolveUniAppXPlatform,
  resolveUniPlatform,
  resolveUniPlatformsFromEnv,
  resolveUniUtsPlatform,
} from './platform'
export { detectAppType } from './project'
export type {
  DetectableAppType,
  DetectAppTypeOptions,
  FrameworkEnv,
  HBuilderXRuntimeHints,
  PackageJsonLike,
  UniAppManifestLike,
  UniPlatformInfo,
} from './types'
