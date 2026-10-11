import fs from 'node:fs/promises'
import process from 'node:process'
import path from 'pathe'
import { describe, expect, it } from 'vitest'
import {
  createWatchCommandSession,
  createWatchSession,
  runPnpmCommand,
  sleep,
} from '../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/session'
import {
  getMtime,
  readFileIfExists,
  waitFor,
  writeFilePreserveEol,
} from '../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/text'
import { clearProjectBuildState } from './projectTest'

interface TemplateDevHmrCase {
  name: string
  template: string
  install?: boolean
  prebuild?: string
  devScript: string
  devCommand?: string[]
  devEnv?: Record<string, string>
  sourceFile: string
  outputFiles: string[]
  sourceNeedle: string
  replacement: string
  expectedOutput: string
}

const repoRoot = path.resolve(__dirname, '..')
const templatesRoot = path.resolve(repoRoot, 'templates')
const timeoutMs = Number(process.env['E2E_TEMPLATE_HMR_TIMEOUT_MS'] ?? process.env['E2E_WATCH_TIMEOUT_MS'] ?? 300_000)
const pollMs = Number(process.env['E2E_TEMPLATE_HMR_POLL_MS'] ?? process.env['E2E_WATCH_POLL_MS'] ?? 250)

const templateDevHmrCases: TemplateDevHmrCase[] = [
  {
    name: 'mpx-tailwindcss-v4 dev hmr',
    template: 'mpx-tailwindcss-v4',
    devScript: 'serve',
    sourceFile: 'src/pages/index.mpx',
    outputFiles: ['dist/wx/pages/index.wxml', 'dist/wx/pages/index.js', 'dist/wx/app.wxss'],
    sourceNeedle: '小程序原子样式模板',
    replacement: '小程序原子样式模板 HMR',
    expectedOutput: 'HMR',
  },
  ...[
    'taro-vite-tailwindcss-v4',
    'taro-webpack-tailwindcss-v4',
  ].map<TemplateDevHmrCase>(template => ({
    name: `${template} weapp dev hmr`,
    template,
    devScript: 'dev:weapp',
    devCommand: ['exec', 'node', '../../scripts/taro-e2e-watch.mjs'],
    devEnv: { TARO_E2E_WATCH_NATIVE: '0' },
    sourceFile: 'src/pages/index/index.tsx',
    outputFiles: ['dist/pages/index/index.wxml', 'dist/pages/index/index.js', 'dist/app.wxss'],
    sourceNeedle: template.includes('vite')
      ? '更轻的多端样式工作台'
      : '经典工程里的现代页面骨架',
    replacement: template.includes('vite')
      ? '更轻的多端样式工作台 HMR'
      : '经典工程里的现代页面骨架 HMR',
    expectedOutput: 'HMR',
  })),
  ...[
    'uni-app-tailwindcss-v4',
  ].map<TemplateDevHmrCase>(template => ({
    name: `${template} mp-weixin dev hmr`,
    template,
    devScript: 'dev:mp-weixin',
    devCommand: ['exec', 'node', '../../scripts/uni-e2e-watch.mjs'],
    sourceFile: 'src/pages/index/index.vue',
    outputFiles: ['dist/build/mp-weixin/pages/index/index.wxml', 'dist/build/mp-weixin/pages/index/index.js', 'dist/build/mp-weixin/app.wxss'],
    sourceNeedle: '小程序里的原子设计基座',
    replacement: '小程序里的原子设计基座 HMR',
    expectedOutput: 'HMR',
  })),
  ...[
    'uni-app-webpack-tailwindcss-v4',
  ].map<TemplateDevHmrCase>(template => ({
    name: `${template} mp-weixin dev hmr`,
    template,
    prebuild: 'build:mp-weixin',
    devScript: 'dev:mp-weixin',
    sourceFile: 'src/pages/index/index.vue',
    outputFiles: ['dist/dev/mp-weixin/pages/index/index.wxml', 'dist/dev/mp-weixin/pages/index/index.js', 'dist/dev/mp-weixin/app.wxss'],
    sourceNeedle: 'webpack 工程里的轻量原子样式',
    replacement: 'webpack 工程里的轻量原子样式 HMR',
    expectedOutput: 'HMR',
  })),
]

function getTemplateRoot(template: string) {
  return path.resolve(templatesRoot, template)
}

function shouldRunCase(name: string) {
  const filter = process.env['E2E_TEMPLATE_HMR_CASE'] ?? process.env['E2E_TEMPLATE_CASE']
  if (!filter) {
    return true
  }
  return new RegExp(filter).test(name)
}

async function readOutputs(root: string, outputFiles: string[]) {
  const texts = await Promise.all(outputFiles.map(file => readFileIfExists(path.resolve(root, file))))
  return texts.filter((text): text is string => text != null).join('\n')
}

async function newestMtime(root: string, outputFiles: string[]) {
  const mtimes = await Promise.all(outputFiles.map(file => getMtime(path.resolve(root, file))))
  return Math.max(...mtimes)
}

async function waitForInitialOutputs(root: string, item: TemplateDevHmrCase, startedAt: number, session: Awaited<ReturnType<typeof createWatchSession>>) {
  const stableWindowMs = Math.min(Math.max(pollMs * 4, 1500), 3000)
  await waitFor(
    async () => {
      session.ensureRunning()
      const text = await readOutputs(root, item.outputFiles)
      return text.includes(item.sourceNeedle)
        || text.includes(item.sourceNeedle.replace(/\s+/g, ''))
        || (
          session.lastCompileSuccessAt() > startedAt
          && Date.now() - session.lastCompileSuccessAt() >= stableWindowMs
        )
    },
    {
      timeoutMs,
      pollMs,
      message: `${item.name} did not emit initial dev outputs\nrecent watch logs:\n${session.logs()}`,
      onTick: session.ensureRunning,
    },
    startedAt,
  )
}

async function waitForHmrOutput(root: string, item: TemplateDevHmrCase, mutatedAt: number, session: Awaited<ReturnType<typeof createWatchSession>>) {
  await waitFor(
    async () => {
      session.ensureRunning()
      const text = await readOutputs(root, item.outputFiles)
      const outputChanged = await newestMtime(root, item.outputFiles) > mutatedAt
      return outputChanged && text.includes(item.expectedOutput)
    },
    {
      timeoutMs,
      pollMs,
      message: `${item.name} did not reflect dev HMR marker in outputs\nrecent watch logs:\n${session.logs()}`,
      onTick: session.ensureRunning,
    },
    mutatedAt,
  )
}

describe('templates dev hmr smoke', () => {
  it.each(templateDevHmrCases.filter(item => shouldRunCase(item.name)))('$name updates dev output after source edit', async (item) => {
    if (process.env['E2E_TEMPLATE_HMR_SKIP'] === '1') {
      return
    }

    const root = getTemplateRoot(item.template)
    const sourceFile = path.resolve(root, item.sourceFile)
    const originalSource = await fs.readFile(sourceFile, 'utf8')
    expect(originalSource, `${item.name} should contain source marker`).toContain(item.sourceNeedle)

    if (process.env['E2E_TEMPLATE_HMR_SKIP_INSTALL'] !== '1') {
      await runPnpmCommand(root, ['install', '--frozen-lockfile'], `${item.template}:install`)
    }
    await clearProjectBuildState(root)
    if (item.prebuild) {
      await runPnpmCommand(root, ['run', item.prebuild], `${item.template}:prebuild`)
    }

    const session = item.devCommand
      ? await createWatchCommandSession(root, item.devCommand, { quietSass: true }, item.devEnv)
      : await createWatchSession(root, item.devScript, { quietSass: true }, item.devEnv)
    const startedAt = session.startedAt ?? Date.now()

    try {
      await waitForInitialOutputs(root, item, startedAt, session)
      const nextSource = originalSource.replace(item.sourceNeedle, item.replacement)
      const mutatedAt = Date.now()
      await writeFilePreserveEol(sourceFile, nextSource, originalSource)
      await sleep(Math.max(pollMs * 2, 500))
      await waitForHmrOutput(root, item, mutatedAt, session)
    }
    finally {
      await writeFilePreserveEol(sourceFile, originalSource, originalSource).catch(() => undefined)
      await session.stop()
    }
  }, timeoutMs + 60_000)
})
