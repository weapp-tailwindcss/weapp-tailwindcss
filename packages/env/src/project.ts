import type { DetectableAppType, DetectAppTypeOptions, PackageJsonLike, UniAppManifestLike } from './types'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { detectAppTypeFromEnv } from './detect-env'
import { getProcessEnv } from './environment'
import { detectAppTypeFromPackageJson, isUniAppXManifest } from './package'

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

  }
}

function detectAppTypeFromMarkers(root: string): DetectableAppType | undefined {
  for (const segments of MPX_MARKERS) {
    if (existsSync(path.join(root, ...segments))) {
      return 'mpx'
    }
  }
}

function detectAppTypeFromRoot(root: string, searchUp = true): DetectableAppType | undefined {
  const resolvedRoot = path.resolve(root)
  if (!existsSync(resolvedRoot)) {
    return
  }

  const markerDetected = detectAppTypeFromMarkers(resolvedRoot)
  if (markerDetected) {
    return markerDetected
  }

  let current = resolvedRoot
  while (true) {
    const manifest = tryReadJson<UniAppManifestLike>(path.join(current, MANIFEST_JSON_FILE))
    if (isUniAppXManifest(manifest)) {
      return 'uni-app-x'
    }

    const pkg = tryReadJson<PackageJsonLike>(path.join(current, PACKAGE_JSON_FILE))
    if (pkg) {
      const detected = detectAppTypeFromPackageJson(pkg)
      if (detected) {
        return detected
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
}

export function detectAppType(options: DetectAppTypeOptions = {}): DetectableAppType | undefined {
  if (isUniAppXManifest(options.manifest)) {
    return 'uni-app-x'
  }

  if (options.packageJson) {
    const detected = detectAppTypeFromPackageJson(options.packageJson)
    if (detected) {
      return detected
    }
  }

  if (options.root) {
    const detected = detectAppTypeFromRoot(options.root, options.searchUp ?? true)
    if (detected) {
      return detected
    }
  }

  const env = options.env ?? (options.detectEnv ? getProcessEnv() : undefined)
  if (env) {
    return detectAppTypeFromEnv(env, {
      cwd: options.cwd ?? options.root ?? (options.detectEnv ? process.cwd() : undefined),
      hbuilderxVite: options.hbuilderxVite,
    })
  }
}
