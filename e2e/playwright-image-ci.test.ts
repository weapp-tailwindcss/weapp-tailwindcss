import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { expect, it } from 'vitest'
import { parse, parseAllDocuments } from 'yaml'

const read = (file: string) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')
const website = parse(read('.github/workflows/website-seo-quality.yml')).jobs['visual-baseline-pipeline']
const expo = parse(read('.github/workflows/react-native-compatibility.yml')).jobs.web
const lock = parseAllDocuments(read('pnpm-lock.yaml')).map(doc => doc.toJSON()).find(doc => doc.importers?.['.']?.devDependencies)

it('网站与 Expo 在固定预装环境运行，拒绝版本漂移及现场冷装浏览器依赖', () => {
  const version = lock.importers['.'].devDependencies.playwright.version
  expect(lock.importers.website.devDependencies['@playwright/test'].version).toBe(version)
  for (const [job, budget] of [[website, 10], [expo, 25]] as const) {
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

it('预装环境不省略网站三引擎管线或 Expo 的实际语义验收', () => {
  const websiteCommands = website.steps.map((step: { run?: string }) => step.run).filter(Boolean)
  expect(websiteCommands).toContain('node scripts/ci/verify-playwright-image.mjs chromium firefox webkit')
  expect(websiteCommands).toContain('pnpm --filter @weapp-tailwindcss/website exec vitest run scripts/visual-baselines scripts/browser-local.test.ts --update=none')
  expect(websiteCommands).toContain('pnpm --filter @weapp-tailwindcss/website e2e:visual:test')
  const expoCommands = expo.steps.map((step: { run?: string }) => step.run).filter(Boolean)
  expect(expoCommands).toContain(`node scripts/ci/verify-playwright-image.mjs ${'$'}{{ matrix.browser }}`)
  for (const command of ['pnpm e2e:react-native-compatibility', 'pnpm e2e:react-native:web']) {
    expect(expoCommands).toContain(command)
  }
})

it('Firefox 使用与容器实际 root 用户归属一致的 HOME', () => {
  for (const job of [website, expo]) {
    expect(job.env.HOME).toBe('/root')
  }
})

it('仅修改预装环境探针也触发两条工作流', () => {
  const expoPaths = parse(read('.github/workflows/react-native-compatibility.yml')).on.pull_request.paths
  const websitePaths = parse(read('.github/workflows/website-seo-quality.yml')).on.push.paths
  for (const paths of [expoPaths, websitePaths]) {
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
