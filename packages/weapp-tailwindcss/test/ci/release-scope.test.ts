import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readChangeRange } from '../../../../scripts/ci/release-metadata/git.mjs'
import { readChangedFiles, resolveChangeScopes } from '../../../../scripts/ci/resolve-pr-scope.mjs'
import { git, gitFixture, writeFiles } from './release-metadata/fixture'

const temporaryDirectories: string[] = []
const script = fileURLToPath(new URL('../../../../scripts/ci/resolve-pr-scope.mjs', import.meta.url))
const heavyFields = ['core', 'watch', 'benchmark', 'release', 'website', 'templates', 'react-native', 'lynx', 'hbuilderx']

function repository() {
  const data = gitFixture()
  temporaryDirectories.push(data.cwd)
  return data
}

function expectComplete(scopes: Record<string, boolean>) {
  expect(scopes).toMatchObject({ metadata_only: false, has_changes: true })
  for (const field of heavyFields) {
    expect(scopes[field]).toBe(true)
  }
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

describe('PR / push 内容范围路由', () => {
  it.each(['README.md', 'packages/a/README.md', 'docs/guide.mdx', 'website/docs/guide.md'])('普通文档保持轻量范围并保留网站 SEO：%s', (file) => {
    const { cwd, after } = repository()
    writeFiles(cwd, { [file]: '中文文档修改。\n' })
    git(cwd, 'add', '.')
    git(cwd, 'commit', '-m', 'docs: update guide')
    const head = git(cwd, 'rev-parse', 'HEAD')
    const scopes = resolveChangeScopes({ eventName: 'pull_request', base: after, head, cwd })
    expect(scopes).toMatchObject({ core: false, watch: false, metadata_only: false, has_changes: true })
    for (const field of heavyFields) {
      expect(scopes[field]).toBe(field === 'website' && file.startsWith('website/'))
    }
  })

  it.each(['packages/a/CHANGELOG.md', 'CHANGELOG.mdx', '.changeset/README.md', '.changeset/invalid.md'])('发布文档仍要求完整元数据证明：%s', (file) => {
    const { cwd, after } = repository()
    writeFiles(cwd, { [file]: '不能通过文档后缀豁免发布验证。\n' })
    git(cwd, 'add', '.')
    git(cwd, 'commit', '-m', 'docs: change release metadata')
    const head = git(cwd, 'rev-parse', 'HEAD')
    vi.spyOn(process.stderr, 'write').mockReturnValue(true)
    expectComplete(resolveChangeScopes({ eventName: 'push', before: after, head, cwd }))
  })

  it('文档与源码一起变化时保留完整检查', () => {
    const { cwd, after } = repository()
    writeFiles(cwd, { 'README.md': '中文文档。\n', 'packages/a/src/index.ts': 'export const changed = true\n' })
    git(cwd, 'add', '.')
    git(cwd, 'commit', '-m', 'docs: mixed changes')
    const head = git(cwd, 'rev-parse', 'HEAD')
    expectComplete(resolveChangeScopes({ eventName: 'push', before: after, head, cwd }))
  })

  it('仅元数据时关闭所有重型范围，保留 has_changes', () => {
    const { cwd, before, after } = repository()
    const scopes = resolveChangeScopes({ eventName: 'pull_request', base: before, head: after, cwd })
    expect(scopes).toMatchObject({ metadata_only: true, has_changes: true })
    for (const field of heavyFields) {
      expect(scopes[field]).toBe(false)
    }
  })

  it('PR 使用 merge-base，排除 base 新增但没有进入 PR 的源码', () => {
    const { cwd, before, after } = repository()
    git(cwd, 'switch', '-c', 'base-advanced', before)
    writeFiles(cwd, { 'packages/a/src/base.ts': 'export const base = true\n' })
    git(cwd, 'add', '.')
    git(cwd, 'commit', '-m', 'test: base advanced')
    const base = git(cwd, 'rev-parse', 'HEAD')
    expect(readChangeRange({ eventName: 'pull_request', base, head: after, cwd }).from).toBe(before)
    expect(readChangedFiles({ eventName: 'pull_request', base, head: after, cwd })).not.toContain('packages/a/src/base.ts')
    expect(resolveChangeScopes({ eventName: 'pull_request', base, head: after, cwd }).metadata_only).toBe(true)
  })

  it('push 从 event.before 到 event.after 分类，不依赖提交标题或作者', () => {
    const { cwd, before, after } = repository()
    const eventPath = path.join(cwd, 'event.json')
    fs.writeFileSync(eventPath, JSON.stringify({ before, after }))
    expect(resolveChangeScopes({ eventName: 'push', eventPath, cwd }).metadata_only).toBe(true)
  })

  it('main 多提交 push 包含源码时完整检查', () => {
    const { cwd, before } = repository()
    writeFiles(cwd, { 'packages/a/src/index.ts': 'export const changed = true\n' })
    git(cwd, 'add', '.')
    git(cwd, 'commit', '-m', 'chore(release): version packages')
    const after = git(cwd, 'rev-parse', 'HEAD')
    expectComplete(resolveChangeScopes({ eventName: 'push', before, head: after, cwd }))
  })

  it.each(['missing-before', 'missing-ref', 'zero-before', 'unknown-event', 'invalid-event'])('边界未知时完整检查：%s', (kind) => {
    const { cwd, before, after } = repository()
    vi.spyOn(process.stderr, 'write').mockReturnValue(true)
    const eventPath = path.join(cwd, 'event.json')
    fs.writeFileSync(eventPath, '{broken')
    const options = {
      cwd,
      eventName: kind === 'unknown-event' ? 'workflow_dispatch' : 'push',
      before: kind === 'missing-before' ? undefined : kind === 'missing-ref' ? 'not-a-ref' : kind === 'zero-before' ? '0'.repeat(40) : before,
      head: after,
      eventPath: kind === 'invalid-event' ? eventPath : null,
    }
    expectComplete(resolveChangeScopes(options))
  })

  it('缺少轻量解析依赖时完整检查', () => {
    const { cwd, before, after } = repository()
    vi.stubEnv('CI_SCOPE_DEPENDENCY_ROOT', path.join(cwd, 'missing'))
    vi.spyOn(process.stderr, 'write').mockReturnValue(true)
    expectComplete(resolveChangeScopes({ eventName: 'push', before, head: after, cwd }))
  })

  it('没有差异时不启动重型检查', () => {
    const { cwd, before } = repository()
    const scopes = resolveChangeScopes({ eventName: 'push', before, head: before, cwd })
    expect(scopes.metadata_only).toBe(false)
    expect(scopes.has_changes).toBe(false)
    expect(heavyFields.every(field => scopes[field] === false)).toBe(true)
  })

  it('CLI --before / --head 写入 GitHub boolean outputs', () => {
    const { cwd, before, after } = repository()
    const output = path.join(cwd, 'github-output.txt')
    const stdout = execFileSync(process.execPath, [script, '--event', 'push', '--before', before, '--head', after, '--github-output', output], {
      cwd,
      encoding: 'utf8',
      env: { ...process.env, GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_EVENT_PATH: '' },
    })
    expect(JSON.parse(stdout).metadata_only).toBe(true)
    expect(fs.readFileSync(output, 'utf8')).toContain('metadata_only=true\n')
    expect(fs.readFileSync(output, 'utf8')).toContain('core=false\n')
  })

  it('CLI --event 允许手动只读验证 PR 差异，不受 Actions 保留环境变量覆盖', () => {
    const { cwd, before, after } = repository()
    const stdout = execFileSync(process.execPath, [script, '--event', 'pull_request', '--base', before, '--head', after], {
      cwd,
      encoding: 'utf8',
      env: { ...process.env, GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_SHA: before },
    })
    expect(JSON.parse(stdout).metadata_only).toBe(true)
  })

  it('CLI PR 模式使用 merge-base 而不是已前进的 base 提交', () => {
    const { cwd, before, after } = repository()
    git(cwd, 'switch', '-c', 'base-advanced', before)
    writeFiles(cwd, { 'packages/a/src/base.ts': 'export const base = true\n' })
    git(cwd, 'add', '.')
    git(cwd, 'commit', '-m', 'test: base advanced')
    const base = git(cwd, 'rev-parse', 'HEAD')
    const stdout = execFileSync(process.execPath, [script, '--event', 'pull_request', '--base', base, '--head', after], {
      cwd,
      encoding: 'utf8',
      env: { ...process.env, GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_SHA: base },
    })
    expect(JSON.parse(stdout).metadata_only).toBe(true)
  })
})
