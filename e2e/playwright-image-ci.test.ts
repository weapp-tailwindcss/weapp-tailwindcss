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

it('仅修改预装环境探针也触发两条工作流', () => {
  const expoPaths = parse(read('.github/workflows/react-native-compatibility.yml')).on.pull_request.paths
  const websitePaths = parse(read('.github/workflows/website-seo-quality.yml')).on.push.paths
  for (const paths of [expoPaths, websitePaths]) {
    expect(paths).toContain('scripts/ci/verify-playwright-image.mjs')
    expect(paths).toContain('.github/actions/setup-process-tools/action.yml')
    expect(paths).toContain('e2e/playwright-image*.test.ts')
  }
})

it.skipIf(process.platform === 'win32')('Linux 进程工具只按需补齐 procps，安装和真实身份查询失败均阻断', async () => {
  const action = parse(read('.github/actions/setup-process-tools/action.yml'))
  const script = action.runs.steps[0].run
  for (const { installed, aptExit, psExit, status } of [
    { installed: true, aptExit: 0, psExit: 0, status: 0 },
    { installed: false, aptExit: 0, psExit: 0, status: 0 },
    { installed: false, aptExit: 7, psExit: 0, status: 7 },
    { installed: true, aptExit: 0, psExit: 9, status: 9 },
  ]) {
    const directory = await mkdtemp(path.join(tmpdir(), 'process tools '))
    try {
      const ps = path.join(directory, 'ps')
      const template = path.join(directory, 'ps-template')
      const apt = path.join(directory, 'apt-get')
      const aptLog = path.join(directory, 'apt.log')
      const psLog = path.join(directory, 'ps.log')
      await writeFile(template, '#!/bin/sh\nprintf \'%s\\n\' "$*" > "$PS_LOG"\nexit "$PS_EXIT"\n')
      await writeFile(apt, '#!/bin/sh\nprintf \'%s\\n\' "$*" >> "$APT_LOG"\n[ "$APT_EXIT" = 0 ] || exit "$APT_EXIT"\ncase " $* " in *" install "*) /bin/cp "$PS_TEMPLATE" "$FAKE_BIN/ps"; /bin/chmod +x "$FAKE_BIN/ps";; esac\n')
      await chmod(apt, 0o755)
      if (installed) {
        await writeFile(ps, await readFile(template))
        await chmod(ps, 0o755)
      }
      const result = spawnSync('/bin/bash', ['-e', '-o', 'pipefail', '-c', script], {
        env: { ...process.env, PATH: directory, FAKE_BIN: directory, PS_TEMPLATE: template, APT_LOG: aptLog, PS_LOG: psLog, APT_EXIT: String(aptExit), PS_EXIT: String(psExit) },
        encoding: 'utf8',
        timeout: 5000,
      })
      expect(result.stderr).toBe('')
      expect(result.status).toBe(status)
      if (installed) {
        await expect(readFile(aptLog)).rejects.toMatchObject({ code: 'ENOENT' })
      }
      else {
        const prefix = '-o Acquire::http::Timeout=30 -o Acquire::https::Timeout=30 '
        expect(await readFile(aptLog, 'utf8')).toBe(`${prefix}update\n${aptExit ? '' : `${prefix}install -y --no-install-recommends procps\n`}`)
      }
      if (installed || !aptExit) {
        expect(await readFile(psLog, 'utf8')).toBe('-A -o pid=,ppid=,pgid=,lstart=,stat=\n')
      }
    }
    finally {
      await rm(directory, { recursive: true, force: true })
    }
  }
})
