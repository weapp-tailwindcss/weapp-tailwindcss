import fs from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readSnapshot } from '../../../../../scripts/ci/release-metadata/git.mjs'
import { resolveChangeScopes } from '../../../../../scripts/ci/resolve-pr-scope.mjs'
import { validateVersionPrDiff } from '../../../../../scripts/ci/version-pr-route.mjs'
import { git, gitFixture } from './fixture'

const directories: string[] = []
const changelog = 'packages/a/CHANGELOG.md'

function repository() {
  const data = gitFixture()
  directories.push(data.cwd)
  return data
}

afterEach(() => {
  vi.restoreAllMocks()
  for (const directory of directories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

describe('发布元数据的 Git 文件类型', () => {
  it.each(['100644', '100755'])('读取 %s 普通 blob 的文本内容', (mode) => {
    const { cwd, after } = repository()
    const contents = readSnapshot(after, cwd).read(changelog)
    const hash = git(cwd, 'rev-parse', `${after}:${changelog}`)
    git(cwd, 'update-index', '--cacheinfo', `${mode},${hash},${changelog}`)
    const tree = git(cwd, 'write-tree')

    expect(git(cwd, 'ls-tree', tree, '--', changelog)).toContain(`${mode} blob`)
    expect(readSnapshot(tree, cwd).read(changelog)).toBe(contents)
  })

  it('保留已有 CHANGELOG 执行位时仍识别合法版本 PR', () => {
    const { cwd, before, after } = repository()
    git(cwd, 'switch', '-c', 'executable-base', before)
    const oldHash = git(cwd, 'rev-parse', `${before}:${changelog}`)
    git(cwd, 'update-index', '--cacheinfo', `100755,${oldHash},${changelog}`)
    git(cwd, 'commit', '-m', 'test: executable changelog baseline')
    const base = git(cwd, 'rev-parse', 'HEAD')
    // 直接复用版本提交的 index 内容，避免依赖宿主文件系统的执行位行为。
    git(cwd, 'read-tree', after)
    const newHash = git(cwd, 'rev-parse', `${after}:${changelog}`)
    git(cwd, 'update-index', '--cacheinfo', `100755,${newHash},${changelog}`)
    git(cwd, 'commit', '-m', 'test: version executable changelog')
    const head = git(cwd, 'rev-parse', 'HEAD')

    expect(git(cwd, 'ls-tree', base, '--', changelog)).toContain('100755 blob')
    expect(git(cwd, 'ls-tree', head, '--', changelog)).toContain('100755 blob')
    expect(resolveChangeScopes({ eventName: 'pull_request', base, head, cwd }).metadata_only).toBe(true)
    expect(() => validateVersionPrDiff({ base, head }, cwd)).not.toThrow()
  })

  it.each(['120000', '160000'])('拒绝 %s 文件类型并保留完整检查', (mode) => {
    const { cwd, before, after } = repository()
    const hash = mode === '160000' ? before : git(cwd, 'rev-parse', `${after}:${changelog}`)
    git(cwd, 'update-index', '--cacheinfo', `${mode},${hash},${changelog}`)
    git(cwd, 'commit', '-m', 'test: invalid metadata file type')
    const head = git(cwd, 'rev-parse', 'HEAD')
    vi.spyOn(process.stderr, 'write').mockReturnValue(true)

    expect(() => readSnapshot(head, cwd).read(changelog)).toThrow('元数据不是普通文本文件')
    expect(resolveChangeScopes({ eventName: 'pull_request', base: before, head, cwd }))
      .toMatchObject({ metadata_only: false, core: true, watch: true, release: true })
    expect(() => validateVersionPrDiff({ base: before, head }, cwd)).toThrow('纯版本')
  })
})
