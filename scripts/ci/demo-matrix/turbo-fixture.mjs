import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { execa } from 'execa'
import { repositoryManifest } from '../version-contract.mjs'
import { repo } from './catalog.mjs'

const require = createRequire(import.meta.url)
const turbo = require.resolve('turbo/bin/turbo')

export const buildEnvironment = [
  'WEAPP_TW_SKIP_AUTO_BUILD',
  'WEAPP_TW_SKIP_INTERACTIVE_TARO_BUILD',
  'WEAPP_TW_SKIP_INTERACTIVE_UNI_BUILD',
  'TARO_BUILD_STRICT',
  'UNI_BUILD_STRICT',
]

export function turboEnvironment(overrides = {}) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('TURBO_') && !buildEnvironment.includes(key)))
  return { ...env, CI: '1', TURBO_TELEMETRY_DISABLED: '1', ...overrides }
}

export async function runTurbo(cwd, args, env = {}, cache = 'local:rw') {
  return execa(process.execPath, [turbo, 'run', 'build', `--cache=${cache}`, '--no-daemon', ...args], {
    cwd,
    env: turboEnvironment(env),
    extendEnv: false,
    timeout: 30_000,
  })
}

export async function dryRun(cwd, args = [], env = {}) {
  const { stdout } = await runTurbo(cwd, [...args, '--dry=json'], env, 'local:r')
  return JSON.parse(stdout)
}

/** 仅在独立临时工作区运行伪构建，执行计数保存在工作区之外，避免改变缓存输入。 */
export async function withTurboFixture(packages, callback) {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'weapp-turbo-cache-'))
  const cwd = path.join(temporary, 'workspace')
  try {
    await mkdir(cwd)
    await copyFile(path.join(repo, 'turbo.json'), path.join(cwd, 'turbo.json'))
    await writeFile(path.join(cwd, 'package.json'), JSON.stringify({
      name: 'turbo-cache-regression',
      private: true,
      packageManager: repositoryManifest.packageManager,
    }))
    await writeFile(path.join(cwd, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\n')
    await writeFile(path.join(cwd, '.gitignore'), '.turbo/\n.output/\ndist/\n')
    const entries = []
    for (const [index, item] of packages.entries()) {
      const relative = `packages/fixture-${index}`
      const directory = path.join(cwd, 'packages', `fixture-${index}`)
      const counter = path.join(temporary, `counter-${index}.txt`)
      await mkdir(directory, { recursive: true })
      await writeFile(counter, '')
      await writeFile(path.join(directory, 'package.json'), JSON.stringify({ name: item.name, version: '0.0.0', scripts: { build: 'node build.mjs' } }))
      await writeFile(path.join(directory, 'fixture.json'), JSON.stringify({ counter, output: item.output ?? 'dist' }))
      await copyFile(path.join(repo, 'scripts', 'ci', 'demo-matrix', 'fixtures', 'turbo-build.mjs'), path.join(directory, 'build.mjs'))
      entries.push({ ...item, directory, counter, relative })
    }
    await writeFile(path.join(cwd, 'pnpm-lock.yaml'), `lockfileVersion: '9.0'\nimporters:\n  .: {}\n${entries.map(item => `  ${item.relative}: {}`).join('\n')}\n`)
    await callback({ cwd, entries, count: async item => (await readFile(item.counter, 'utf8')).trim().split('\n').filter(Boolean).length })
  }
  finally {
    await rm(temporary, { recursive: true, force: true })
  }
}
