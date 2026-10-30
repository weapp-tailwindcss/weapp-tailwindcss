import { execFile } from 'node:child_process'
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import { afterEach, expect, it } from 'vitest'

const websiteRoot = fileURLToPath(new URL('..', import.meta.url))
const require = createRequire(import.meta.url)
const execute = promisify(execFile)
const roots: string[] = []
const helperParts = ['tests', 'helpers', 'full-page', 'toc']
const policy = { hideOnScroll: false, minHeadingLevel: 3, maxHeadingLevel: 4 }

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

async function writeMetadata(target: string, minHeadingLevel: number) {
  await writeFile(target, JSON.stringify({ source: '@site/docs/probe.md', permalink: '/module-entry/', frontMatter: { toc_min_heading_level: minHeadingLevel } }))
}

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'website-toc-entry-中文 #'))
  roots.push(root)
  const repository = path.join(root, 'repository')
  const website = path.join(repository, 'website')
  const cwd = path.join(root, 'unrelated')
  const metadata = path.join(website, '.docusaurus', 'docusaurus-plugin-content-docs', 'default', 'probe.json')
  await mkdir(path.dirname(metadata), { recursive: true })
  await mkdir(path.join(website, ...helperParts), { recursive: true })
  await mkdir(path.join(cwd, '.docusaurus'), { recursive: true })
  await writeFile(path.join(cwd, '.docusaurus', 'docusaurus.config.mjs'), '不能用 cwd 猜测构建根目录')
  await writeFile(path.join(website, 'package.json'), '{}')
  await writeFile(path.join(website, '.docusaurus', 'docusaurus.config.mjs'), `export default ${JSON.stringify({
    themeConfig: { navbar: { hideOnScroll: false }, tableOfContents: { minHeadingLevel: 2, maxHeadingLevel: 4 } },
  })};`)
  await writeMetadata(metadata, 3)
  for (const file of ['site-policy.ts', 'site-policy.mts']) {
    await copyFile(path.join(websiteRoot, ...helperParts, file), path.join(website, ...helperParts, file))
  }
  return { root, repository, website, cwd, metadata }
}

async function playwright(args: string[], cwd: string) {
  const { stdout } = await execute(process.execPath, [require.resolve('@playwright/test/cli'), 'test', ...args, '--reporter=json'], {
    cwd,
    env: { ...process.env, CI: '1', PLAYWRIGHT_HTML_OPEN: 'never', PLAYWRIGHT_JSON_OUTPUT_FILE: undefined },
    timeout: 20_000,
    maxBuffer: 10 * 1024 * 1024,
  })
  const report = JSON.parse(stdout)
  expect(report.errors).toEqual([])
  return report
}

it.each(['cjs', 'mts'])('Playwright %s 配置真实执行 CJS/ESM 入口，读取 helper 自身位置的准确 metadata', async (extension) => {
  const { root, website, cwd } = await fixture()
  const tests = path.join(website, 'tests')
  const body = `
    test('读取自身构建与路由策略', async () => {
      const { readWebsiteTocMetadata } = await import('./helpers/full-page/toc/site-policy.mts')
      const metadata = await readWebsiteTocMetadata(${JSON.stringify(website)})
      expect(metadata.digest).toMatch(/^[a-f0-9]{64}$/)
      expect(metadata.policies.get('/module-entry')).toEqual(${JSON.stringify(policy)})
      expect(await websiteTocPolicy('/module-entry/')).toEqual(${JSON.stringify(policy)})
      expect(await websiteTocPolicy('/unknown')).toBeNull()
    })
  `
  await writeFile(path.join(tests, 'module-entry.spec.cts'), `
    const { test, expect } = require(${JSON.stringify(require.resolve('@playwright/test'))})
    const { websiteTocPolicy } = require('./helpers/full-page/toc/site-policy.ts')
    ${body}
  `)
  await writeFile(path.join(tests, 'module-entry.spec.mts'), `
    import api from ${JSON.stringify(pathToFileURL(require.resolve('@playwright/test')).href)}
    const { test, expect } = api
    import { websiteTocPolicy } from './helpers/full-page/toc/site-policy.ts'
    ${body}
  `)
  const config = path.join(root, `playwright.config.${extension}`)
  const options = JSON.stringify({ testDir: tests, testMatch: '**/module-entry.spec.@(cts|mts)', outputDir: path.join(root, 'results'), workers: 1, retries: 0, timeout: 10_000, use: { headless: true } })
  await writeFile(config, extension === 'cjs'
    ? `const { defineConfig } = require(${JSON.stringify(require.resolve('@playwright/test'))}); module.exports = defineConfig(${options})`
    : `import api from ${JSON.stringify(pathToFileURL(require.resolve('@playwright/test')).href)}; const { defineConfig } = api; export default defineConfig(${options})`)
  const report = await playwright(['--config', config], cwd)
  expect(report.stats).toMatchObject({ expected: 2, unexpected: 0, flaky: 0, skipped: 0 })
}, 25_000)

it.each(['default', 'local', 'capture'])('实际 %s 入口可发现 index.spec.ts 的三浏览器用例', async (mode) => {
  const { root } = await fixture()
  let config = path.join(websiteRoot, 'playwright.config.mts')
  if (mode === 'local') {
    config = path.join(websiteRoot, 'scripts', 'local-worker', 'playwright.config.mts')
  }
  else if (mode === 'capture') {
    config = path.join(root, 'capture.config.mts')
    await writeFile(config, [
      `import api from ${JSON.stringify(pathToFileURL(require.resolve('@playwright/test')).href)}`,
      'const { defineConfig } = api',
      `import base from ${JSON.stringify(pathToFileURL(path.join(websiteRoot, 'scripts', 'local-worker', 'playwright.config.mts')).href)}`,
      `export default defineConfig({ ...base, testMatch: 'index.spec.ts', grep: /viewport.* screenshot$/, snapshotDir: ${JSON.stringify(path.join(root, 'snapshots'))}, outputDir: ${JSON.stringify(path.join(root, 'results'))}, updateSnapshots: 'missing' })`,
    ].join('\n'))
  }
  const report = await playwright(['--config', config, '--list', 'index.spec.ts'], websiteRoot)
  expect(report.config.projects.map((project: { name: string }) => project.name)).toEqual(['chromium', 'firefox', 'webkit'])
  expect(report.suites).toHaveLength(1)
  expect(report.suites[0].file).toBe('index.spec.ts')
  expect(report.suites[0].suites.length).toBeGreaterThan(0)
}, 25_000)

it.each(['cts', 'mts'])('tsx %s 入口真实读取 captureIdentity，构建 metadata 变化影响身份', async (extension) => {
  const { root, repository, website, cwd, metadata } = await fixture()
  await mkdir(path.join(website, 'build'))
  await mkdir(path.join(website, 'scripts', 'local-worker'), { recursive: true })
  await mkdir(path.join(repository, 'scripts', 'e2e-preflight'), { recursive: true })
  await writeFile(path.join(website, '.gitignore'), '/.docusaurus/\n/build/\n')
  await writeFile(path.join(website, 'build', 'index.html'), '<main>stable rendered output</main>')
  await writeFile(path.join(repository, 'pnpm-lock.yaml'), 'fixture-lock')
  await writeFile(path.join(repository, 'scripts', 'e2e-preflight', 'cleanup.ts'), 'fixture-lifecycle')
  for (const file of ['routes.json', 'playwright.config.mts', 'scripts/local-worker/playwright.config.mts', 'tests/index.spec.ts']) {
    await writeFile(path.join(website, file), 'fixture-contract')
  }
  await execute('git', ['init', '--quiet'], { cwd: repository })
  await execute('git', ['add', '.'], { cwd: repository })
  await execute('git', ['-c', 'user.name=TOC fixture', '-c', 'user.email=toc-fixture@example.invalid', '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=', 'commit', '--quiet', '-m', 'test: module entry fixture'], { cwd: repository })
  const identity = path.join(websiteRoot, 'scripts', 'visual-baselines', 'identity.ts')
  const entry = path.join(root, `identity.${extension}`)
  const imports = extension === 'cts'
    ? `const { captureIdentity } = require(${JSON.stringify(identity)})`
    : `import { captureIdentity } from ${JSON.stringify(pathToFileURL(identity).href)}`
  await writeFile(entry, `${imports}\ncaptureIdentity(${JSON.stringify(website)}).then(value => console.log(JSON.stringify(value)))`)
  const run = async () => {
    const { stdout } = await execute(process.execPath, [require.resolve('tsx/cli'), entry], { cwd, timeout: 20_000 })
    return JSON.parse(stdout)
  }
  const first = await run()
  expect(first).toMatchObject({ head: expect.stringMatching(/^[a-f0-9]{40}$/), node: process.version })
  for (const key of ['lock', 'contract', 'build']) {
    expect(first[key]).toMatch(/^[a-f0-9]{64}$/)
  }
  await writeMetadata(metadata, 2)
  const second = await run()
  expect(second).toEqual({ ...first, build: expect.any(String) })
  expect(second.build).not.toBe(first.build)
  expect(await readFile(path.join(website, 'build', 'index.html'), 'utf8')).toBe('<main>stable rendered output</main>')
}, 45_000)
