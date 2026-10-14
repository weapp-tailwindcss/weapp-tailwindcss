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
  resolvePlatform,
  resolvePlatformIdentity,
  resolveTaroPlatform,
  resolveUniAppXPlatform,
  resolveUniPlatform,
  resolveUniPlatformsFromEnv,
  resolveUniUtsPlatform,
} from './platform'
export { detectAppType } from './project'
export type {
  CanonicalPlatform,
  DetectableAppType,
  DetectAppTypeOptions,
  FrameworkEnv,
  HBuilderXRuntimeHints,
  PackageJsonLike,
  PlatformIdentityInfo,
  UniAppManifestLike,
  UniPlatformInfo,
} from './types'
