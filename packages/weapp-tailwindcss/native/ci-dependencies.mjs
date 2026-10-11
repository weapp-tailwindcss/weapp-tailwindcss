import { execFileSync, spawnSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'

function dependencyIdentity(root, target, env) {
  // 容器与宿主 uid 不同；只对调用者指定的当前 checkout 信任目录所有权。
  const files = execFileSync('git', [
    '-c',
    `safe.directory=${root}`,
    'ls-files',
    '-z',
    '--',
    '**/package.json',
    'package.json',
    'pnpm-lock.yaml',
    'pnpm-workspace.yaml',
    '**/.npmrc',
    '.npmrc',
    '**/.pnpmfile.*',
    '.pnpmfile.*',
    'patches/**',
  ], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean).sort()
  const hash = createHash('sha256').update(JSON.stringify([target, env.GITHUB_RUN_ID, env.GITHUB_RUN_ATTEMPT, env.GITHUB_JOB]))
  for (const file of files) {
    hash.update('\0').update(file).update('\0').update(readFileSync(join(root, file)))
  }
  return hash.digest('hex')
}

/** 仅复用同轮成功安装的依赖；配置、patch 或目标变化时拒绝 ABI 验证。 */
export function prepareNativeDependencies({ root, target, reuse = false, env = process.env, install }) {
  if (!target) {
    throw new Error('Native dependency setup requires an explicit target')
  }
  const stamp = join(root, 'node_modules', '.cache', 'native-ci-dependencies.json')
  const identity = dependencyIdentity(root, target, env)
  if (reuse) {
    const previous = existsSync(stamp) ? JSON.parse(readFileSync(stamp, 'utf8')) : undefined
    if (previous?.schemaVersion !== 1 || previous.identity !== identity
      || !existsSync(join(root, 'node_modules', '.modules.yaml'))
      || !existsSync(join(root, 'node_modules', 'tsx', 'package.json'))) {
      throw new Error('Native ABI verification requires dependencies installed in this job for the same target and configuration')
    }
    return
  }

  // 安装失败时不得留下前一次成功标记。
  rmSync(stamp, { force: true })
  const args = ['install', '--frozen-lockfile']
  if (env.NATIVE_PNPM_STORE) {
    args.push('--store-dir', resolve(env.NATIVE_PNPM_STORE))
  }
  if (install) {
    install(args)
  }
  else {
    const result = spawnSync('pnpm', args, { cwd: root, env, stdio: 'inherit', shell: process.platform === 'win32' })
    if (result.error || result.status !== 0) {
      throw result.error ?? new Error(`Native dependency installation failed: ${result.signal ?? result.status}`)
    }
  }
  mkdirSync(dirname(stamp), { recursive: true })
  const temporary = `${stamp}.${randomUUID()}.tmp`
  writeFileSync(temporary, `${JSON.stringify({ schemaVersion: 1, identity })}\n`)
  renameSync(temporary, stamp)
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  prepareNativeDependencies({
    root: resolve(dirname(fileURLToPath(import.meta.url)), '../../..'),
    target: process.env.NATIVE_TARGET,
    reuse: process.env.NATIVE_REUSE_DEPENDENCIES === '1',
  })
}
