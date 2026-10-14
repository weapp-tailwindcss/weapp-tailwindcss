import type { AppTypeDetectionCandidate, AppTypeDetectionReport, DetectableAppType, DetectAppTypeOptions, PackageJsonLike, UniAppManifestLike } from './types'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { matchEnvironment } from './detect-env'
import { getProcessEnv } from './environment'
import { collectMatches, detectionReport, evidence } from './matching'
import { isUniAppXManifest, matchPackageJson } from './package'

const PACKAGE_JSON_FILE = 'package.json'
const MANIFEST_JSON_FILE = 'manifest.json'
const MPX_MARKERS = [['src', 'app.mpx'], ['app.mpx']] as const

function tryReadJson<T>(file: string): T | undefined {
  if (!existsSync(file)) {
    return
  }
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as T
  }
  catch {
    // 保持历史行为：损坏或不可读取的配置继续交给后续识别阶段。
  }
}

function manifestMatches(manifest: UniAppManifestLike | undefined, file?: string): AppTypeDetectionCandidate[] {
  return isUniAppXManifest(manifest)
    ? [{ appType: 'uni-app-x', evidence: [evidence('manifest', 'uni-app-x', undefined, file)] }]
    : []
}

function matchRoot(root: string, searchUp: boolean, all: boolean): AppTypeDetectionCandidate[] {
  const resolvedRoot = path.resolve(root)
  if (!existsSync(resolvedRoot)) {
    return []
  }
  const markers = []
  for (const segments of MPX_MARKERS) {
    const file = path.join(resolvedRoot, ...segments)
    if (existsSync(file)) {
      markers.push(evidence('marker', 'app.mpx', undefined, file))
      if (!all) {
        break
      }
    }
  }
  if (markers.length) {
    return [{ appType: 'mpx', evidence: markers }]
  }
  let current = resolvedRoot
  while (true) {
    const manifestFile = path.join(current, MANIFEST_JSON_FILE)
    const manifest = manifestMatches(tryReadJson<UniAppManifestLike>(manifestFile), manifestFile)
    if (manifest.length) {
      return manifest
    }
    const packageFile = path.join(current, PACKAGE_JSON_FILE)
    const pkg = tryReadJson<PackageJsonLike>(packageFile)
    if (pkg) {
      const candidates = collectMatches(matchPackageJson(pkg, all, packageFile), all)
      if (candidates.length) {
        return candidates
      }
    }
    if (!searchUp) {
      break
    }
    const parent = path.dirname(current)
    if (parent === current) {
      break
    }
    current = parent
  }
  return []
}

function matchAppType(options: DetectAppTypeOptions, all: boolean): AppTypeDetectionCandidate[] {
  const manifest = manifestMatches(options.manifest)
  if (manifest.length) {
    return manifest
  }
  if (options.packageJson) {
    const candidates = collectMatches(matchPackageJson(options.packageJson, all), all)
    if (candidates.length) {
      return candidates
    }
  }
  if (options.root) {
    const candidates = matchRoot(options.root, options.searchUp ?? true, all)
    if (candidates.length) {
      return candidates
    }
  }
  const env = options.env ?? (options.detectEnv ? getProcessEnv() : undefined)
  if (!env) {
    return []
  }
  return collectMatches(matchEnvironment(env, {
    cwd: options.cwd ?? options.root ?? (options.detectEnv ? process.cwd() : undefined),
    hbuilderxVite: options.hbuilderxVite,
  }), all)
}

export function detectAppType(options: DetectAppTypeOptions = {}): DetectableAppType | undefined {
  return matchAppType(options, false)[0]?.appType
}

/** 解释首次命中阶段的框架候选与冲突，不扩大项目搜索范围。 */
export function detectAppTypeReport(options: DetectAppTypeOptions = {}): AppTypeDetectionReport {
  return detectionReport(matchAppType(options, true))
}
