import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { chromium, firefox, webkit } from 'playwright'
import sharp from 'sharp'
import { digest, filesDigest, regularBytes, treeFiles } from './files'

export async function baselineContract(websiteRoot: string) {
  const website = await filesDigest(websiteRoot, [
    'routes.json',
    'playwright.config.mts',
    'scripts/local-worker/playwright.config.mts',
    'tests/index.spec.ts',
    ...await treeFiles(path.join(websiteRoot, 'tests', 'helpers')).then(files => files.map(file => `tests/helpers/${file}`)),
  ])
  const lifecycle = digest(await regularBytes(path.resolve(websiteRoot, '..', 'scripts', 'e2e-preflight', 'cleanup.ts')))
  return digest(JSON.stringify({ website, lifecycle }))
}

export async function renderEnvironment(websiteRoot: string) {
  const require = createRequire(pathToFileURL(path.join(websiteRoot, 'package.json')))
  const versions: Record<string, string> = {}
  for (const [name, type] of Object.entries({ chromium, firefox, webkit })) {
    const browser = await type.launch({ headless: true, ...(name === 'chromium' && process.env.PLAYWRIGHT_CHROMIUM_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHROMIUM_CHANNEL } : {}) })
    try {
      versions[name] = browser.version()
    }
    finally {
      await browser.close()
    }
  }
  return { platform: os.platform(), arch: os.arch(), release: os.release(), playwright: require('@playwright/test/package.json').version as string, browsers: versions, imageDecoder: { sharp: sharp.versions.sharp, vips: sharp.versions.vips } }
}

/** 来源只作为黄金图历史证据；未来源码变化仍应运行像素回归，不能强制重录黄金图。 */
export async function captureSource(websiteRoot: string) {
  const repository = path.dirname(websiteRoot)
  const git = (...args: string[]) => execFileSync('git', args, { cwd: repository, encoding: 'utf8' }).trim()
  if (git('status', '--porcelain', '--untracked-files=normal')) {
    throw new Error('采集黄金候选前必须先提交本任务源码，不能绑定未确认的工作树')
  }
  return {
    head: git('rev-parse', 'HEAD'),
    lock: digest(await regularBytes(path.join(repository, 'pnpm-lock.yaml'))),
    contract: await baselineContract(websiteRoot),
    node: process.version,
  }
}

export async function captureIdentity(websiteRoot: string) {
  return {
    ...await captureSource(websiteRoot),
    build: await filesDigest(path.join(websiteRoot, 'build'), await treeFiles(path.join(websiteRoot, 'build'))),
  }
}
