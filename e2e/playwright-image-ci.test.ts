import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { expect, it } from 'vitest'
import { parse, parseAllDocuments } from 'yaml'

const read = (file: string) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')
const website = parse(read('.github/workflows/website-seo-quality.yml')).jobs['visual-baseline-pipeline']
const expo = parse(read('.github/workflows/react-native-compatibility.yml')).jobs.web
const css = parse(read('.github/workflows/css-compat.yml')).jobs.semantics
const browserJobs = [website, expo, css]
const lock = parseAllDocuments(read('pnpm-lock.yaml')).map(doc => doc.toJSON()).find(doc => doc.importers?.['.']?.devDependencies)

it('网站、Expo 与 CSS 语义在固定预装环境运行，拒绝版本漂移及现场冷装浏览器依赖', () => {
  const version = lock.importers['.'].devDependencies.playwright.version
  expect(lock.importers.website.devDependencies['@playwright/test'].version).toBe(version)
  for (const [job, budget] of [[website, 10], [expo, 25], [css, 25]] as const) {
    expect(job.container?.image).toMatch(/^mcr\.microsoft\.com\/playwright:v[\d.]+-noble@sha256:[a-f0-9]{64}$/)
    expect(job.container?.image).toContain(`:v${version}-noble@`)
    expect(job.container).toEqual(website.container)
    expect(job.container.options).toBe('--init --ipc=host')
    expect(job.defaults.run.shell).toBe('bash')
    expect(job['timeout-minutes']).toBe(budget)
    expect(job['continue-on-error']).not.toBe(true)
    const steps = job.steps as { 'run'?: string, 'continue-on-error'?: boolean }[]
    const commands = steps.map(step => step.run ?? '').join('\n')
    expect(commands).not.toMatch(/playwright install|apt-get|install-deps/)
    expect(steps.every(step => !step['continue-on-error'])).toBe(true)
    expect(commands).toContain('node scripts/ci/verify-playwright-image.mjs')
    const tools = job.steps.find((step: { uses?: string }) => step.uses === './.github/actions/setup-process-tools')
    expect(tools?.['timeout-minutes']).toBe(2)
    expect(tools?.['continue-on-error']).not.toBe(true)
  }
})

it('预装环境不省略网站、Expo 与 CSS 的实际语义验收', () => {
  const websiteCommands = website.steps.map((step: { run?: string }) => step.run).filter(Boolean)
  expect(websiteCommands).toContain('node scripts/ci/verify-playwright-image.mjs chromium firefox webkit')
  const unitCommands = websiteCommands.filter((command: string) => command.startsWith('pnpm --filter @weapp-tailwindcss/website exec vitest run '))
  expect(unitCommands).toHaveLength(1)
  const targets = unitCommands[0].trim().split(/\s+/).slice(6)
  expect(targets).toEqual(expect.arrayContaining([
    'scripts/visual-baselines',
    'scripts/browser-local.test.ts',
    'scripts/full-page-capabilities.test.ts',
    'scripts/full-page-observed.test.ts',
    'scripts/full-page-toc-entry.test.ts',
    'scripts/full-page-toc-policy.test.ts',
    'scripts/full-page-toc.test.ts',
    'scripts/full-page-monitor.test.ts',
    'scripts/full-page-composition.test.ts',
    '--update=none',
  ]))
  expect(websiteCommands).toContain('pnpm --filter @weapp-tailwindcss/website e2e:visual:test')
  const expoCommands = expo.steps.map((step: { run?: string }) => step.run).filter(Boolean)
  expect(expoCommands).toContain(`node scripts/ci/verify-playwright-image.mjs ${'$'}{{ matrix.browser }}`)
  for (const command of ['pnpm e2e:react-native-compatibility', 'pnpm e2e:react-native:web']) {
    expect(expoCommands).toContain(command)
  }
  const cssCommands = css.steps.map((step: { run?: string }) => step.run).filter(Boolean)
  for (const command of [
    'node scripts/ci/verify-playwright-image.mjs chromium firefox webkit',
    'pnpm --filter @weapp-tailwindcss/postcss... run build',
    'pnpm --filter @weapp-tailwindcss/css-compat properties:check',
    'pnpm --filter @weapp-tailwindcss/css-compat test:consumers',
    'pnpm --filter @weapp-tailwindcss/css-compat test:browser',
  ]) {
    expect(cssCommands).toContain(command)
  }
})

it('Firefox 使用与容器实际 root 用户归属一致的 HOME', () => {
  for (const job of browserJobs) {
    expect(job.env.HOME).toBe('/root')
  }
})

it.skipIf(process.platform === 'win32')('容器只信任当前挂载工作区，其他归属异常的仓库仍被拒绝', async () => {
  for (const job of browserJobs) {
    const stepIndex = job.steps.findIndex((step: { name?: string }) => step.name === 'Trust container workspace')
    expect(stepIndex).toBeGreaterThan(job.steps.findIndex((step: { uses?: string }) => step.uses?.startsWith('actions/checkout@')))
    expect(stepIndex).toBeLessThan(job.steps.findIndex((step: { uses?: string }) => step.uses?.includes('pnpm')))
    const directory = await mkdtemp(path.join(tmpdir(), 'container workspace '))
    try {
      const workspace = path.join(directory, 'owned workspace')
      const unrelated = path.join(directory, 'unrelated')
      await Promise.all([mkdir(workspace), mkdir(unrelated)])
      const config = path.join(directory, 'gitconfig')
      await writeFile(config, '')
      const env = { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: config, GIT_TEST_ASSUME_DIFFERENT_OWNER: '1', GITHUB_WORKSPACE: workspace }
      const git = (cwd: string, args: string[], differentOwner = true) => spawnSync('git', args, { cwd, env: { ...env, GIT_TEST_ASSUME_DIFFERENT_OWNER: differentOwner ? '1' : '0' }, encoding: 'utf8', timeout: 5000 })
      for (const repo of [workspace, unrelated]) {
        expect(git(repo, ['init']).status).toBe(0)
        expect(git(repo, ['-c', 'user.name=fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '--allow-empty', '-m', 'fixture'], false).status).toBe(0)
        const rejected = git(repo, ['rev-parse', 'HEAD'])
        expect(rejected.status).not.toBe(0)
        expect(rejected.stderr).toContain('dubious ownership')
      }
      const configured = spawnSync('/bin/bash', ['-e', '-o', 'pipefail', '-c', job.steps[stepIndex].run], { env, encoding: 'utf8', timeout: 5000 })
      expect(configured.status).toBe(0)
      const accepted = git(workspace, ['rev-parse', 'HEAD'])
      expect(accepted.status).toBe(0)
      expect(accepted.stdout.trim()).toMatch(/^[a-f\d]{40,64}$/)
      expect(git(unrelated, ['rev-parse', 'HEAD']).stderr).toContain('dubious ownership')
      expect(git(workspace, ['config', '--global', '--get-all', 'safe.directory']).stdout.trim()).toBe(workspace)
    }
    finally {
      await rm(directory, { recursive: true, force: true })
    }
  }
})

it('仅修改预装环境探针也触发三条工作流', () => {
  const expoPaths = parse(read('.github/workflows/react-native-compatibility.yml')).on.pull_request.paths
  const websitePaths = parse(read('.github/workflows/website-seo-quality.yml')).on.push.paths
  const cssPaths = parse(read('.github/workflows/css-compat.yml')).on.push.paths
  for (const paths of [expoPaths, websitePaths, cssPaths]) {
    expect(paths).toContain('scripts/ci/verify-playwright-image.mjs')
    expect(paths).toContain('.github/actions/setup-process-tools/action.yml')
    expect(paths).toContain('e2e/playwright-image*.test.ts')
  }
})

it.skipIf(process.platform === 'win32')('预装进程工具缺失或真实身份查询失败均阻断，不访问 APT 兜底', async () => {
  const action = parse(read('.github/actions/setup-process-tools/action.yml'))
  const script = action.runs.steps[0].run
  expect(script).not.toMatch(/apt-get|install|curl|wget/)
  for (const { installed, psExit, status } of [
    { installed: true, psExit: 0, status: 0 },
    { installed: false, psExit: 0, status: 127 },
    { installed: true, psExit: 9, status: 9 },
  ]) {
    const directory = await mkdtemp(path.join(tmpdir(), 'process tools '))
    try {
      const ps = path.join(directory, 'ps')
      const psLog = path.join(directory, 'ps.log')
      if (installed) {
        await writeFile(ps, '#!/bin/sh\nprintf \'%s\\n\' "$*" > "$PS_LOG"\nexit "$PS_EXIT"\n')
        await chmod(ps, 0o755)
      }
      const result = spawnSync('/bin/bash', ['-e', '-o', 'pipefail', '-c', script], {
        env: { ...process.env, PATH: directory, PS_LOG: psLog, PS_EXIT: String(psExit) },
        encoding: 'utf8',
        timeout: 5000,
      })
      expect(result.status).toBe(status)
      if (installed) {
        expect(result.stderr).toBe('')
        expect(await readFile(psLog, 'utf8')).toBe('-A -o pid=,ppid=,pgid=,lstart=,stat=\n')
      }
      else {
        expect(result.stderr).toContain('ps: command not found')
        await expect(readFile(psLog)).rejects.toMatchObject({ code: 'ENOENT' })
      }
    }
    finally {
      await rm(directory, { recursive: true, force: true })
    }
  }
})
