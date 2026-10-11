import { Buffer } from 'node:buffer'
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { isDeepStrictEqual } from 'node:util'

const dependencyFields = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']
const workspaceManifestPattern = /^(?:packages|packages-runtime)\/[^/]+\/package\.json$/
const demoManifestPattern = /^demo\/[^/]+\/package\.json$/
const demoChangelogPattern = /^demo\/(?:web\/)?[^/]+\/CHANGELOG\.md$/

export const performanceRelevantPaths = [
  ':(glob)packages/*/src/**',
  ':(glob)packages/*/package.json',
  ':(glob)packages/*/tsconfig.json',
  ':(glob)packages/*/tsdown.config.*',
  ':(glob)packages-runtime/*/src/**',
  ':(glob)packages-runtime/*/package.json',
  ':(glob)packages-runtime/*/tsconfig.json',
  ':(glob)packages-runtime/*/tsdown.config.*',
  ':(glob)demo/**',
  ':(glob)patches/**',
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'turbo.json',
]

function isReleaseRangeChange(baselineSpec, currentSpec, versionTransition) {
  const baselineVersion = versionTransition?.baseline
  const currentVersion = versionTransition?.current
  if (
    typeof baselineVersion !== 'string'
    || typeof currentVersion !== 'string'
    || baselineVersion === currentVersion
  ) {
    return false
  }
  return baselineSpec.replaceAll(baselineVersion, '<released-version>')
    === currentSpec.replaceAll(currentVersion, '<released-version>')
}

function normalizeManifestPair(baseline, current, workspaceVersionTransitions) {
  const normalizedBaseline = structuredClone(baseline)
  const normalizedCurrent = structuredClone(current)
  delete normalizedBaseline.version
  delete normalizedCurrent.version

  for (const field of dependencyFields) {
    const baselineDependencies = normalizedBaseline[field]
    const currentDependencies = normalizedCurrent[field]
    if (!baselineDependencies || !currentDependencies) {
      continue
    }
    for (const [name, versionTransition] of workspaceVersionTransitions) {
      if (
        typeof baselineDependencies[name] === 'string'
        && typeof currentDependencies[name] === 'string'
        && isReleaseRangeChange(
          baselineDependencies[name],
          currentDependencies[name],
          versionTransition,
        )
      ) {
        baselineDependencies[name] = '<workspace-release-range>'
        currentDependencies[name] = '<workspace-release-range>'
      }
    }
  }

  return [normalizedBaseline, normalizedCurrent]
}

export function hasPerformanceRelevantManifestChanges(baseline, current, workspaceVersionTransitions) {
  if (!baseline || !current) {
    return true
  }
  const normalized = normalizeManifestPair(baseline, current, workspaceVersionTransitions)
  return !isDeepStrictEqual(...normalized)
}

function isTaroBuildGuardOnlyChange(baseline, current) {
  const baselineBuildScript = baseline?.scripts?.['build:weapp']
  const currentBuildScript = current?.scripts?.['build:weapp']
  if (
    typeof baselineBuildScript !== 'string'
    || typeof currentBuildScript !== 'string'
    || baselineBuildScript === currentBuildScript
    || !currentBuildScript.includes('taro-build-guard.mjs')
  ) {
    return false
  }

  const normalizedBaseline = structuredClone(baseline)
  const normalizedCurrent = structuredClone(current)
  delete normalizedBaseline.scripts?.['build:weapp']
  delete normalizedCurrent.scripts?.['build:weapp']
  return isDeepStrictEqual(normalizedBaseline, normalizedCurrent)
}

export async function classifyChangedPerformanceFiles(changedFiles, readManifestPair) {
  const manifestFiles = changedFiles.filter(file => workspaceManifestPattern.test(file) || demoManifestPattern.test(file))
  const ignoredNonPerformanceFiles = changedFiles.filter(file => file.startsWith('packages-runtime/cn/'))
  const directRelevantFiles = changedFiles.filter(file => !workspaceManifestPattern.test(file) && !demoManifestPattern.test(file) && !demoChangelogPattern.test(file) && !file.startsWith('packages-runtime/cn/'))
  const manifestPairs = new Map()
  const workspaceVersionTransitions = new Map()

  for (const file of manifestFiles) {
    const pair = await readManifestPair(file)
    manifestPairs.set(file, pair)
    const name = pair?.current?.name ?? pair?.baseline?.name
    if (typeof name === 'string') {
      workspaceVersionTransitions.set(name, {
        baseline: pair?.baseline?.version,
        current: pair?.current?.version,
      })
    }
  }

  const relevantManifestFiles = []
  const ignoredReleaseMetadataFiles = changedFiles.filter(file => demoChangelogPattern.test(file))
  for (const file of manifestFiles) {
    const pair = manifestPairs.get(file)
    if (file === 'packages-runtime/cn/package.json') {
      ignoredNonPerformanceFiles.push(file)
    }
    else if (demoManifestPattern.test(file) && isTaroBuildGuardOnlyChange(pair?.baseline, pair?.current)) {
      ignoredNonPerformanceFiles.push(file)
    }
    else if (workspaceManifestPattern.test(file) && hasPerformanceRelevantManifestChanges(pair?.baseline, pair?.current, workspaceVersionTransitions)) {
      relevantManifestFiles.push(file)
    }
    else if (workspaceManifestPattern.test(file)) {
      ignoredReleaseMetadataFiles.push(file)
    }
    else {
      relevantManifestFiles.push(file)
    }
  }

  const relevantFiles = [...directRelevantFiles, ...relevantManifestFiles].sort()
  return {
    relevant: relevantFiles.length > 0,
    relevantFiles,
    ignoredReleaseMetadataFiles: ignoredReleaseMetadataFiles.sort(),
    ignoredNonPerformanceFiles: ignoredNonPerformanceFiles.sort(),
  }
}

async function captureGit(repoRoot, args, { allowFailure = false } = {}) {
  const child = spawn('git', args, {
    cwd: repoRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const stdout = []
  const stderr = []
  child.stdout.on('data', chunk => stdout.push(chunk))
  child.stderr.on('data', chunk => stderr.push(chunk))
  const code = await new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('close', exitCode => resolve(exitCode ?? 1))
  })
  if (code !== 0 && !allowFailure) {
    throw new Error(`git ${args.join(' ')} failed with code ${code}\n${Buffer.concat(stderr).toString('utf8')}`)
  }
  return {
    code,
    stdout: Buffer.concat(stdout),
  }
}

async function readManifestAtRef(repoRoot, ref, file) {
  const result = await captureGit(repoRoot, ['show', `${ref}:${file}`], { allowFailure: true })
  if (result.code !== 0) {
    return undefined
  }
  return JSON.parse(result.stdout.toString('utf8'))
}

async function readCurrentManifest(repoRoot, file) {
  try {
    return JSON.parse(await fs.readFile(path.join(repoRoot, file), 'utf8'))
  }
  catch (error) {
    if (error?.code === 'ENOENT') {
      return undefined
    }
    throw error
  }
}

export async function classifyPerformanceChanges(repoRoot, ref) {
  const diff = await captureGit(repoRoot, ['diff', '--name-only', '-z', ref, '--', ...performanceRelevantPaths])
  const changedFiles = diff.stdout.toString('utf8').split('\0').filter(Boolean)
  return classifyChangedPerformanceFiles(changedFiles, async file => ({
    baseline: await readManifestAtRef(repoRoot, ref, file),
    current: await readCurrentManifest(repoRoot, file),
  }))
}

export function summarizeFiles(files, limit = 8) {
  if (files.length <= limit) {
    return files.join(', ')
  }
  return `${files.slice(0, limit).join(', ')} 等 ${files.length} 个文件`
}
