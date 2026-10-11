import type { DetectableAppType, PackageJsonLike, UniAppManifestLike } from './types'

const MPX_SCRIPT_RE = /\bmpx(?:-cli-service)?\b/u
const TARO_SCRIPT_RE = /\btaro\b/u
const WEAPP_VITE_SCRIPT_RE = /\bweapp-vite\b/u
const UNI_APP_SCRIPT_RE = /\buni(?:\s|$)/u
const UNI_APP_VITE_SCRIPT_RE = /\buni(?:\s|$)/u
function resolveDependencyNames(pkg: PackageJsonLike) {
  return new Set([
    ...Object.keys(pkg.dependencies ?? {}),
    ...Object.keys(pkg.devDependencies ?? {}),
    ...Object.keys(pkg.peerDependencies ?? {}),
    ...Object.keys(pkg.optionalDependencies ?? {}),
  ])
}

function hasDependencyPrefix(dependencyNames: Set<string>, prefix: string) {
  return [...dependencyNames].some(name => name.startsWith(prefix))
}

function hasScriptMatch(pkg: PackageJsonLike, pattern: RegExp) {
  return Object.values(pkg.scripts ?? {}).some(script => pattern.test(script))
}

export function isWeappVitePackage(pkg: PackageJsonLike) {
  const dependencyNames = resolveDependencyNames(pkg)
  return dependencyNames.has('weapp-vite')
    || hasDependencyPrefix(dependencyNames, '@weapp-vite/')
    || hasScriptMatch(pkg, WEAPP_VITE_SCRIPT_RE)
}

export function isMpxPackage(pkg: PackageJsonLike) {
  const dependencyNames = resolveDependencyNames(pkg)
  return hasDependencyPrefix(dependencyNames, '@mpxjs/')
    || hasScriptMatch(pkg, MPX_SCRIPT_RE)
}

export function isTaroPackage(pkg: PackageJsonLike) {
  const dependencyNames = resolveDependencyNames(pkg)
  return hasDependencyPrefix(dependencyNames, '@tarojs/')
    || hasScriptMatch(pkg, TARO_SCRIPT_RE)
}

export function isUniAppVitePackage(pkg: PackageJsonLike) {
  return resolveDependencyNames(pkg).has('@dcloudio/vite-plugin-uni')
    || hasScriptMatch(pkg, UNI_APP_VITE_SCRIPT_RE)
}

export function isUniAppXPackage(pkg: PackageJsonLike) {
  const dependencyNames = resolveDependencyNames(pkg)
  return dependencyNames.has('@dcloudio/uni-uts-v1')
    || dependencyNames.has('@weapp-tailwindcss/debug-uni-app-x')
}

export function isUniAppPackage(pkg: PackageJsonLike) {
  const dependencyNames = resolveDependencyNames(pkg)
  return dependencyNames.has('@dcloudio/vue-cli-plugin-uni')
    || dependencyNames.has('@dcloudio/uni-app')
    || Object.hasOwn(pkg, 'uni-app')
    || hasScriptMatch(pkg, UNI_APP_SCRIPT_RE)
}

export function isUniAppXManifest(manifest: UniAppManifestLike | undefined) {
  return Boolean(manifest && Object.hasOwn(manifest, 'uni-app-x'))
}

export function detectAppTypeFromPackageJson(pkg: PackageJsonLike): DetectableAppType | undefined {
  if (isWeappVitePackage(pkg)) {
    return 'weapp-vite'
  }
  if (isMpxPackage(pkg)) {
    return 'mpx'
  }
  if (isTaroPackage(pkg)) {
    return 'taro'
  }
  if (isUniAppXPackage(pkg)) {
    return 'uni-app-x'
  }
  if (isUniAppVitePackage(pkg)) {
    return 'uni-app-vite'
  }
  if (isUniAppPackage(pkg)) {
    return 'uni-app'
  }
}
