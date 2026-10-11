import { cp, mkdir, mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { execa } from 'execa'

if (process.platform !== 'win32') {
  throw new Error('此入口要求真实 Windows，以便区分 Windows 复现与其它系统的对照。')
}
const repo = process.cwd()
const artifactRoot = path.resolve('e2e', '.artifacts', 'issue-hbuilderx-windows', 'before')
const baseline = 'be518d94790c29aad401220b5cdb2a5d23173d5f'
await mkdir(artifactRoot, { recursive: true })
const parent = await mkdtemp(path.join(tmpdir(), 'issue-hbuilderx-before-'))
const checkout = path.join(parent, 'repo')

async function run(command, args, name, cwd = checkout, env = {}) {
  console.log(`[Windows 对照] ${name}`)
  const result = await execa(command, args, {
    cwd,
    env,
    all: true,
    reject: false,
    timeout: 600_000,
    maxBuffer: 64 * 1024 * 1024,
  })
  await writeFile(path.join(artifactRoot, `${name}.log`), result.all ?? '')
  console.log((result.all ?? '').slice(-3000))
  return result
}

async function required(command, args, name, cwd) {
  const result = await run(command, args, name, cwd)
  if (result.exitCode !== 0) {
    throw new Error(`${name} 未完成：${result.exitCode}`)
  }
}

await required('git', ['fetch', 'origin', baseline, '--depth=1'], 'fetch-baseline', repo)
await required('git', ['worktree', 'add', '--detach', checkout, baseline], 'create-baseline', repo)
// 对照使用相同验收层，产品源码与依赖版本保留修复前基线。
for (const file of ['e2e/hbuilderx-local', 'e2e/issue-1170-web.test.ts']) {
  await cp(path.resolve(repo, file), path.resolve(checkout, file), { recursive: true })
}
await required('pnpm', ['install', '--frozen-lockfile'], 'install-baseline')
await required('pnpm', ['--filter', 'weapp-tailwindcss...', 'run', 'build'], 'build-baseline')
const result = await run('pnpm', [
  'exec',
  'vitest',
  'run',
  '-c',
  'e2e/vitest.e2e.config.ts',
  'e2e/issue-1170-web.test.ts',
  '-t',
  'preserves CRLF styles',
  '--update=none',
], 'hmr-baseline', checkout, { E2E_ISSUE_1170_WEB: '1', E2E_HBUILDERX_WEB_TIMEOUT_MS: '45000' })
const evidenceRoot = path.join(checkout, 'e2e', '.artifacts', 'web-hmr')
const directories = await readdir(evidenceRoot)
const failures = []
for (const name of directories) {
  const directory = path.join(evidenceRoot, name)
  await cp(directory, path.join(artifactRoot, name), { recursive: true })
  try {
    const failure = await readFile(path.join(directory, 'failure.txt'), 'utf8')
    const diagnostics = JSON.parse(await readFile(path.join(directory, 'diagnostics.json'), 'utf8'))
    const initial = await readFile(path.join(directory, 'initial.png'))
    if (failure.includes('hmr:issue-1170-text-save-1') && failure.includes('Hello Tailwind on uni-app save-1')
      && failure.includes('rgba(0, 0, 0, 0)') && initial.length > 0 && diagnostics.errors.length === 0) {
      failures.push(name)
    }
  }
  catch {
    // 服务启动失败或缺少首次加载证据，不能被归类为保存后丢样式。
  }
}
const reproduced = result.exitCode !== 0 && failures.length > 0
await writeFile(path.join(artifactRoot, 'comparison.json'), JSON.stringify({
  baseline,
  platform: process.platform,
  node: process.version,
  hbuilderx: process.env.HBUILDERX_VERSION,
  reproduced,
  failures,
}, null, 2))
if (!reproduced) {
  throw new Error('未取得 Windows 修复前首次加载正常、第一次保存后静默丢样式的证据。')
}
console.log('Windows 修复前问题已复现；最新源码的同例验证见前序步骤。')
