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
  resolvePlatformIdentity,
  resolveTaroPlatform,
  resolveTaroPlatformFromEnv,
  resolveUniAppXPlatform,
  resolveUniPlatform,
  resolveUniPlatformsFromEnv,
  resolveUniUtsPlatform,
} from './platform'
export { detectAppType, detectAppTypeReport } from './project'
export type { AppTypeDetectionCandidate, AppTypeDetectionEvidence, AppTypeDetectionReport } from './types'
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
