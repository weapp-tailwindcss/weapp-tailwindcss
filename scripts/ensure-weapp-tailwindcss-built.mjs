import { spawnSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { createPnpmCommand } from './pnpm-command.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
const buildLockRoot = path.join(tmpdir(), 'weapp-tailwindcss-build-locks')
const buildLockWaitMs = 50
const buildLockStaleMs = 30 * 60 * 1000
const runtimeBuildTargets = [
  {
    name: '@weapp-tailwindcss/runtime',
    filter: '@weapp-tailwindcss/runtime',
    label: '@weapp-tailwindcss/runtime',
    packageRoot: path.join(repoRoot, 'packages-runtime/runtime'),
  },
  {
    name: '@weapp-tailwindcss/merge',
    filter: '@weapp-tailwindcss/merge',
    label: '@weapp-tailwindcss/merge',
    packageRoot: path.join(repoRoot, 'packages-runtime/merge'),
  },
  {
    name: '@weapp-tailwindcss/cva',
    filter: '@weapp-tailwindcss/cva',
    label: '@weapp-tailwindcss/cva',
    packageRoot: path.join(repoRoot, 'packages-runtime/cva'),
  },
  {
    name: '@weapp-tailwindcss/variants',
    filter: '@weapp-tailwindcss/variants',
    label: '@weapp-tailwindcss/variants',
    packageRoot: path.join(repoRoot, 'packages-runtime/variants'),
  },
  {
    name: '@weapp-tailwindcss/typography',
    filter: '@weapp-tailwindcss/typography',
    label: '@weapp-tailwindcss/typography',
    packageRoot: path.join(repoRoot, 'packages-runtime/typography'),
  },
]
export const buildTargets = [
  {
    filter: '@weapp-tailwindcss/shared',
    label: '@weapp-tailwindcss/shared',
    packageRoot: path.join(repoRoot, 'packages/shared'),
  },
  {
    filter: '@weapp-tailwindcss/logger',
    label: '@weapp-tailwindcss/logger',
    packageRoot: path.join(repoRoot, 'packages/logger'),
  },
  {
    filter: '@weapp-tailwindcss/postcss-calc',
    label: '@weapp-tailwindcss/postcss-calc',
    packageRoot: path.join(repoRoot, 'packages/postcss-calc'),
  },
  {
    filter: 'tailwindcss-config',
    label: 'tailwindcss-config',
    packageRoot: path.join(repoRoot, 'packages/tailwindcss-config'),
  },
  {
    filter: '@weapp-tailwindcss/reset',
    label: '@weapp-tailwindcss/reset',
    packageRoot: path.join(repoRoot, 'packages/reset'),
  },
  {
    filter: '@weapp-tailwindcss/css-compat',
    label: '@weapp-tailwindcss/css-compat',
    packageRoot: path.join(repoRoot, 'packages/css-compat'),
  },
  {
    filter: '@weapp-tailwindcss/postcss',
    label: '@weapp-tailwindcss/postcss',
    packageRoot: path.join(repoRoot, 'packages/postcss'),
  },
  {
    filter: '@weapp-tailwindcss/debug-uni-app-x',
    label: '@weapp-tailwindcss/debug-uni-app-x',
    packageRoot: path.join(repoRoot, 'packages/debug-uni-app-x'),
  },
  {
    filter: 'weapp-style-injector',
    label: 'weapp-style-injector',
    packageRoot: path.join(repoRoot, 'packages/weapp-style-injector'),
  },
  {
    filter: 'weapp-tailwindcss',
    label: '核心包',
    packageRoot: path.join(repoRoot, 'packages/weapp-tailwindcss'),
    extraStamps: ['dist/weapp-tw-runtime-classset-loader.cjs'],
  },
]

function readPackageJson(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  }
  catch {
    return undefined
  }
}

function collectDistEntries(value, entries) {
  if (typeof value === 'string') {
    const normalized = value.startsWith('./') ? value.slice(2) : value
    if (normalized.startsWith('dist/') && !normalized.includes('*')) {
      entries.add(normalized)
    }
    return
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      collectDistEntries(entry, entries)
    }
    return
  }

  if (value && typeof value === 'object') {
    for (const entry of Object.values(value)) {
      collectDistEntries(entry, entries)
    }
  }
}

export function collectPackageEntryStamps(packageRoot) {
  const packageJson = readPackageJson(path.join(packageRoot, 'package.json'))
  if (!packageJson) {
    return []
  }

  const entries = new Set()
  for (const value of [
    packageJson.exports,
    packageJson.main,
    packageJson.module,
    packageJson.types,
    packageJson.typings,
    packageJson.bin,
  ]) {
    collectDistEntries(value, entries)
  }
  return [...entries].sort()
}

export function resolveTargetStamps(target) {
  return [...new Set([
    ...collectPackageEntryStamps(target.packageRoot),
    ...(target.extraStamps ?? []),
  ])]
}

function collectWorkspaceRuntimeDependencyNames() {
  const packageJson = readPackageJson(path.join(process.cwd(), 'package.json'))
  const dependencies = {
    ...(packageJson?.dependencies ?? {}),
    ...(packageJson?.devDependencies ?? {}),
  }
  return new Set(
    Object.entries(dependencies)
      .filter(([, version]) => version === 'workspace:*')
      .map(([name]) => name),
  )
}

function collectLatestMtime(target, ignoredDirectories = new Set()) {
  let latest = 0
  const visit = (current) => {
    let stats
    try {
      stats = statSync(current)
    }
    catch {
      return
    }

    if (stats.isDirectory()) {
      if (ignoredDirectories.has(path.basename(current))) {
        return
      }
      for (const entry of readdirSync(current)) {
        visit(path.join(current, entry))
      }
      return
    }

    if (stats.isFile()) {
      latest = Math.max(latest, stats.mtimeMs)
    }
  }
  visit(target)
  return latest
}

export function shouldBuild(target) {
  const srcRoot = path.join(target.packageRoot, 'src')
  const distRoot = path.join(target.packageRoot, 'dist')
  const stampFiles = resolveTargetStamps(target)
    .map(stamp => path.join(target.packageRoot, stamp))

  if (
    !existsSync(distRoot)
    || stampFiles.length === 0
    || stampFiles.some(file => !existsSync(file))
  ) {
    return true
  }
  const latestSource = collectLatestMtime(srcRoot)
  const latestDist = collectLatestMtime(distRoot, new Set(['node_modules']))
  return latestSource > latestDist
}

function sleepSync(milliseconds) {
  const signal = new Int32Array(new SharedArrayBuffer(4))
  Atomics.wait(signal, 0, 0, milliseconds)
}

function buildLockPath(packageRoot) {
  const packageKey = createHash('sha256').update(path.resolve(packageRoot)).digest('hex')
  return path.join(buildLockRoot, packageKey)
}

function readBuildLockOwner(lockPath) {
  try {
    return JSON.parse(readFileSync(path.join(lockPath, 'owner.json'), 'utf8'))
  }
  catch {
    return undefined
  }
}

function isProcessAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false
  }

  try {
    process.kill(pid, 0)
    return true
  }
  catch (error) {
    return error?.code === 'EPERM'
  }
}

function isBuildLockStale(lockPath) {
  const owner = readBuildLockOwner(lockPath)
  if (owner && isProcessAlive(owner.pid)) {
    return false
  }

  try {
    return Date.now() - statSync(lockPath).mtimeMs > buildLockStaleMs
  }
  catch {
    return false
  }
}

function acquireBuildLock(packageRoot) {
  mkdirSync(buildLockRoot, { recursive: true })
  const lockPath = buildLockPath(packageRoot)
  const token = randomUUID()

  while (true) {
    try {
      // mkdir 是跨平台的原子创建操作，适合协调多个 demo 进程。
      mkdirSync(lockPath)
      writeFileSync(path.join(lockPath, 'owner.json'), JSON.stringify({
        pid: process.pid,
        token,
        createdAt: Date.now(),
      }))
      return { lockPath, token }
    }
    catch (error) {
      if (error?.code !== 'EEXIST') {
        throw error
      }

      if (isBuildLockStale(lockPath)) {
        rmSync(lockPath, { recursive: true, force: true })
        continue
      }

      sleepSync(buildLockWaitMs)
    }
  }
}

function releaseBuildLock(lock) {
  const owner = readBuildLockOwner(lock.lockPath)
  if (owner?.token !== lock.token) {
    return
  }

  rmSync(lock.lockPath, { recursive: true, force: true })
}

export function withBuildLock(packageRoot, callback) {
  const lock = acquireBuildLock(packageRoot)
  try {
    return callback()
  }
  finally {
    releaseBuildLock(lock)
  }
}

export function shouldSkipAutoBuild(env = process.env) {
  return env.WEAPP_TW_SKIP_AUTO_BUILD === '1'
}

function expandRuntimeBuildTargets() {
  const dependencyNames = collectWorkspaceRuntimeDependencyNames()
  if (dependencyNames.size === 0) {
    return []
  }

  const selectedNames = new Set()
  const addTarget = (target) => {
    if (target) {
      selectedNames.add(target.name)
    }
  }
  const targetByName = new Map(runtimeBuildTargets.map(target => [target.name, target]))

  for (const name of dependencyNames) {
    const target = targetByName.get(name)
    if (target) {
      addTarget(target)
    }
  }

  if (
    dependencyNames.has('@weapp-tailwindcss/merge')
    || dependencyNames.has('@weapp-tailwindcss/cva')
    || dependencyNames.has('@weapp-tailwindcss/variants')
  ) {
    addTarget(targetByName.get('@weapp-tailwindcss/runtime'))
  }
  if (dependencyNames.has('@weapp-tailwindcss/variants')) {
    addTarget(targetByName.get('@weapp-tailwindcss/merge'))
  }

  return runtimeBuildTargets.filter(target => selectedNames.has(target.name))
}

export function main() {
  if (shouldSkipAutoBuild()) {
    return
  }

  const staleTargets = [
    ...buildTargets,
    ...expandRuntimeBuildTargets(),
  ].filter(shouldBuild)

  for (const target of staleTargets) {
    const result = withBuildLock(target.packageRoot, () => {
      // 等待其他进程完成后重新判断，避免重复构建或读取半成品声明。
      if (!shouldBuild(target)) {
        return undefined
      }

      console.log(`[weapp-tailwindcss] ${target.label} dist 已过期，正在构建供 demo 使用...`)
      const command = createPnpmCommand(['--filter', target.filter, 'build'])
      const result = spawnSync(
        command.command,
        command.args,
        {
          cwd: repoRoot,
          stdio: 'inherit',
          env: process.env,
          shell: command.shell,
        },
      )

      return result
    })

    if (!result) {
      continue
    }
    if (result.error) {
      console.error(result.error)
      process.exit(1)
    }

    if (result.status !== 0) {
      process.exit(result.status ?? 1)
    }
  }
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  main()
}
