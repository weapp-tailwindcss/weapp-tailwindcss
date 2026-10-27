import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import semver from 'semver'
import { expect, it } from 'vitest'
import YAML from 'yaml'
import { selectStagedFiles, stagedExcludes, stagedGlob } from '../../../../../scripts/git-hooks/staged-eslint.mjs'
import { environment, hookConfig, root } from './fixture'

const require = createRequire(path.join(root, 'package.json'))

it('Windows 的 Path 搜索目录传给子进程时不会被新增 PATH 键覆盖', () => {
  const original = 'C:\\Program Files\\Git\\cmd;C:\\Windows\\System32'
  const env = environment(root, { Path: original })
  expect(env.PATH?.endsWith(original)).toBe(true)
  expect(Object.keys(env).filter(key => key.toLowerCase() === 'path')).toEqual(['PATH'])
})

it('Lefthook 重新暂存范围与实际 ESLint 检查范围一致', () => {
  const config = YAML.parse(hookConfig)
  expect(config['pre-commit'].jobs[0]).toMatchObject({ glob: stagedGlob, exclude: stagedExcludes, stage_fixed: true })
  expect(selectStagedFiles([
    'root.ts', "src/中文 component's.ts", 'src/line\nbreak.js', '-root.ts',
    '.agents/ignored.ts', 'nested/.agents/ignored.ts', 'e2e/__snapshots__/ignored.ts', 'other.txt', '',
  ].join('\0'))).toEqual(['root.ts', "src/中文 component's.ts", 'src/line\nbreak.js', '-root.ts'])
})

it('开发工具满足安装版本的 Node 和 peer 要求，最低公开运行时仍受支持', () => {
  const manifest = require(path.join(root, 'package.json'))
  const repoctl = require('repoctl/package.json')
  expect(semver.subset(manifest.engines.node, repoctl.engines.node)).toBe(true)
  const defaultNode = fs.readFileSync(path.join(root, '.nvmrc'), 'utf8').trim()
  expect(semver.satisfies(defaultNode, manifest.engines.node)).toBe(true)
  expect(semver.satisfies('22.18.0', manifest.engines.node)).toBe(false)
  for (const pkg of ['vitest', '@commitlint/cli', 'stylelint']) {
    expect(semver.satisfies(require(`${pkg}/package.json`).version, repoctl.peerDependencies[pkg])).toBe(true)
  }
  const version = require('vitest/package.json').version
  for (const pkg of ['@vitest/ui', '@vitest/coverage-v8']) {
    expect(require(`${pkg}/package.json`).version).toBe(version)
  }
  for (const pkg of ['weapp-tailwindcss', 'engine']) {
    const published = JSON.parse(fs.readFileSync(path.join(root, 'packages', pkg, 'package.json'), 'utf8'))
    expect(semver.satisfies('22.18.0', published.engines.node)).toBe(true)
  }
})
