import assert from 'node:assert/strict'
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { execa } from 'execa'
import { parse, stringify } from 'yaml'
import { packRuntimeDependencies } from './pack-runtime-dependencies.mjs'
import { assertDependencyVersions, readInstalledDependencyVersions, readPackageJson, repositoryManifest, repositoryPackageManager } from './version-contract.mjs'
import { inspectOutput, verifyOutput } from './windows-utilities-output.mjs'

const repo = fileURLToPath(new URL('../../', import.meta.url))
const fixture = path.join(repo, 'e2e/fixtures/taro-webpack-default-utilities')
const reportDir = path.join(repo, 'e2e/.artifacts/windows-utilities')
const update = process.argv.includes('--update')
assert.ok(!update || !process.env.CI, 'CI must not update the baseline')
const temporary = await mkdtemp(path.join(tmpdir(), 'weapp-1159 space-'))
const project = path.join(temporary, 'project')
const reports = []
await mkdir(reportDir, { recursive: true })

async function runPnpm(args, cwd = project) {
  const result = await execa('pnpm', ['--config.minimum-release-age=1', ...args], { cwd, env: { CI: 'true' }, timeout: 600_000 })
  return result.stdout
}

async function stopTree(child) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return
  }
  if (process.platform === 'win32') {
    await execa('taskkill', ['/pid', String(child.pid), '/T', '/F'], { reject: false })
  }
  else {
    try {
      process.kill(-child.pid, 'SIGTERM')
    }
    catch (error) {
      if (error.code !== 'ESRCH') {
        throw error
      }
    }
  }
}

async function build(mode, label) {
  await rm(path.join(project, 'dist'), { recursive: true, force: true })
  const require = createRequire(path.join(project, 'package.json'))
  const cli = path.join(path.dirname(require.resolve('@tarojs/cli/package.json')), 'bin/taro')
  const child = execa(process.execPath, [cli, 'build', '--type', 'weapp', ...(mode === 'development' ? ['--watch'] : [])], {
    cwd: project,
    detached: process.platform !== 'win32',
    env: { NODE_ENV: mode, BROWSERSLIST_ENV: mode, TARO_ENV: 'weapp', CI: 'true' },
    reject: false,
  })
  let log = ''
  let ready
  const compiled = new Promise((resolve) => {
    ready = resolve
  })
  const capture = (data) => {
    log += data.toString()
    if (log.includes('WEAPP_1159_COMPILED')) {
      ready()
    }
  }
  child.stdout.on('data', capture)
  child.stderr.on('data', capture)
  let timer
  try {
    const completed = child.then((result) => {
      assert.equal(result.exitCode, 0, log)
      assert.ok(log.includes('WEAPP_1159_COMPILED'), log)
    })
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`Taro ${mode} timed out\n${log}`)), 240_000)
    })
    await Promise.race([mode === 'development' ? Promise.race([compiled, completed]) : completed, timeout])
    const output = await inspectOutput(path.join(project, 'dist'))
    await cp(path.join(project, 'dist'), path.join(reportDir, label, mode), { recursive: true })
    return output
  }
  finally {
    clearTimeout(timer)
    await stopTree(child)
    await child
    await writeFile(path.join(reportDir, `${label}-${mode}.log`), log)
  }
}

async function verify(label, expectRegression) {
  const versions = await readInstalledDependencyVersions(project, ['weapp-tailwindcss', 'tailwindcss', '@tarojs/cli', 'webpack'])
  const manifest = await readPackageJson(path.join(project, 'package.json'))
  const { 'weapp-tailwindcss': candidateVersion, ...toolchainVersions } = versions
  assertDependencyVersions(manifest, toolchainVersions)
  if (label === 'candidate') {
    const candidate = await readPackageJson(path.join(repo, 'packages/weapp-tailwindcss/package.json'))
    assert.equal(candidateVersion, candidate.version, '候选包版本必须来自当前提交')
  }
  else {
    assertDependencyVersions(manifest, { 'weapp-tailwindcss': candidateVersion })
  }
  for (const mode of ['development', 'production']) {
    const output = await build(mode, label)
    reports.push({ label, mode, versions, expectRegression, output })
    await writeFile(path.join(reportDir, 'report.json'), JSON.stringify({ os: process.platform, node: process.version, reports }, null, 2))
    verifyOutput(output, expectRegression)
    if (!expectRegression) {
      const baseline = path.join(fixture, 'expected.json')
      if (update && label === 'candidate' && mode === 'production') {
        await writeFile(baseline, `${JSON.stringify(output, null, 2)}\n`)
      }
      else if (!update) {
        assert.deepEqual(output, JSON.parse(await readFile(baseline, 'utf8')))
      }
    }
    console.log(`${label} ${mode}: ${expectRegression ? 'confirmed published regression' : 'all output assertions passed'}`)
  }
}

try {
  await cp(fixture, project, { recursive: true })
  const fixtureManifest = await readPackageJson(path.join(project, 'package.json'))
  // 仅临时副本跟随仓库工具链，历史依赖及冻结锁文件仍用于发布版回归。
  fixtureManifest.packageManager = repositoryManifest.packageManager
  await writeFile(path.join(project, 'package.json'), JSON.stringify(fixtureManifest, null, 2))
  assert.equal((await runPnpm(['--version'])).trim(), repositoryPackageManager.version)
  await writeFile(path.join(reportDir, 'published-install.log'), await runPnpm(['install', '--frozen-lockfile']))
  await verify('published', process.platform === 'win32')

  const packDir = path.join(temporary, 'packed')
  await mkdir(packDir)
  const candidates = await packRuntimeDependencies(repo, 'weapp-tailwindcss', packDir, project, runPnpm)
  const manifestFile = path.join(project, 'package.json')
  const manifest = JSON.parse(await readFile(manifestFile, 'utf8'))
  manifest.devDependencies['weapp-tailwindcss'] = candidates['weapp-tailwindcss']
  await writeFile(manifestFile, JSON.stringify(manifest, null, 2))
  const workspaceFile = path.join(project, 'pnpm-workspace.yaml')
  const workspace = parse(await readFile(workspaceFile, 'utf8'))
  workspace.overrides = { ...workspace.overrides, ...candidates }
  await writeFile(workspaceFile, stringify(workspace))
  await writeFile(path.join(reportDir, 'candidate-packages.json'), JSON.stringify(candidates, null, 2))
  // 候选包及运行时 workspace 依赖来自同一提交，冻结安装后仍不依赖 workspace 链接。
  // 临时项目重新解析候选包时允许当前 registry 的新鲜版本，避免 release age
  // 窗口在 CI 运行期间阻塞与本次验证无关的锁文件生成。
  await writeFile(path.join(reportDir, 'candidate-lock.log'), await runPnpm(['install', '--lockfile-only', '--ignore-scripts']))
  await writeFile(path.join(reportDir, 'candidate-install.log'), await runPnpm(['install', '--frozen-lockfile']))
  await cp(path.join(project, 'pnpm-lock.yaml'), path.join(reportDir, 'candidate-lock.yaml'))
  await verify('candidate', false)
}
finally {
  await rm(temporary, { recursive: true, force: true })
}
