import type { AppTypeDetectionCandidate, AppTypeDetectionEvidence, DetectableAppType, PackageJsonLike, UniAppManifestLike } from './types'
import { collectMatches, evidence } from './matching'
import { detectFrameworkCommands } from './script-command'

const FRAMEWORK_PRIORITY: DetectableAppType[] = ['weapp-vite', 'mpx', 'taro', 'uni-app-x', 'uni-app-vite', 'uni-app']
const DEPENDENCY_FIELDS = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'] as const

function matchesDependency(appType: DetectableAppType, name: string): boolean {
  switch (appType) {
    case 'weapp-vite': return name === 'weapp-vite' || name.startsWith('@weapp-vite/')
    case 'mpx': return name.startsWith('@mpxjs/')
    case 'taro': return name.startsWith('@tarojs/')
    case 'uni-app-x': return name === '@dcloudio/uni-uts-v1' || name === '@weapp-tailwindcss/debug-uni-app-x'
    case 'uni-app-vite': return name === '@dcloudio/vite-plugin-uni'
    case 'uni-app': return name === '@dcloudio/vue-cli-plugin-uni' || name === '@dcloudio/uni-app'
  }
}

function packageMatcher(pkg: PackageJsonLike, file?: string) {
  let scripts: { name: string, value: string, commands: DetectableAppType[] }[] | undefined
  return (appType: DetectableAppType, all: boolean): AppTypeDetectionEvidence[] => {
    const result: AppTypeDetectionEvidence[] = []
    for (const field of DEPENDENCY_FIELDS) {
      for (const [name, version] of Object.entries(pkg[field] ?? {})) {
        if (matchesDependency(appType, name)) {
          result.push(evidence('dependency', `${field}.${name}`, version, file))
          if (!all) {
            return result
          }
        }
      }
    }
    if (appType === 'uni-app' && Object.hasOwn(pkg, 'uni-app')) {
      result.push(evidence('package-field', 'uni-app', undefined, file))
      if (!all) {
        return result
      }
    }
    if (appType === 'uni-app-x') {
      return result
    }
    scripts ??= Object.entries(pkg.scripts ?? {}).map(([name, value]) => ({
      name,
      value,
      commands: detectFrameworkCommands(value),
    }))
    for (const script of scripts) {
      const commandType = appType === 'uni-app' ? 'uni-app-vite' : appType
      if (script.commands.includes(commandType)) {
        result.push(evidence('script', `scripts.${script.name}`, script.value, file))
        if (!all) {
          return result
        }
      }
    }
    return result
  }
}

export function* matchPackageJson(pkg: PackageJsonLike, all: boolean, file?: string): Iterable<AppTypeDetectionCandidate> {
  const match = packageMatcher(pkg, file)
  for (const appType of FRAMEWORK_PRIORITY) {
    const evidence = match(appType, all)
    if (evidence.length) {
      yield { appType, evidence }
    }
  }
}

export function isWeappVitePackage(pkg: PackageJsonLike) {
  return packageMatcher(pkg)('weapp-vite', false).length > 0
}

export function isMpxPackage(pkg: PackageJsonLike) {
  return packageMatcher(pkg)('mpx', false).length > 0
}

export function isTaroPackage(pkg: PackageJsonLike) {
  return packageMatcher(pkg)('taro', false).length > 0
}

export function isUniAppVitePackage(pkg: PackageJsonLike) {
  return packageMatcher(pkg)('uni-app-vite', false).length > 0
}

export function isUniAppXPackage(pkg: PackageJsonLike) {
  return packageMatcher(pkg)('uni-app-x', false).length > 0
}

export function isUniAppPackage(pkg: PackageJsonLike) {
  return packageMatcher(pkg)('uni-app', false).length > 0
}

export function isUniAppXManifest(manifest: UniAppManifestLike | undefined) {
  return Boolean(manifest && Object.hasOwn(manifest, 'uni-app-x'))
}

export function detectAppTypeFromPackageJson(pkg: PackageJsonLike): DetectableAppType | undefined {
  return collectMatches(matchPackageJson(pkg, false), false)[0]?.appType
}
