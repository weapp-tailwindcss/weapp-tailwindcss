import type { SpawnSyncReturns } from 'node:child_process'
import { rmSync, writeFileSync } from 'node:fs'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { clearWorkspaceCache, createReleasePullRequest } from 'repoctl'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { nativeTargets } from '../../native/targets.mjs'

const directories: string[] = []
const nativeNames = Object.values(nativeTargets).map(({ suffix }) => `@weapp-tailwindcss/native-${suffix}`)

afterEach(async () => {
  clearWorkspaceCache()
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})

describe('repoctl 原生平台包发布说明', () => {
  it.each(['en', 'zh-CN'] as const)('在 %s 发布 PR 中保留只有版本标题的全部平台包', async (locale) => {
    const cwd = await mkdtemp(join(tmpdir(), 'native-release-notes-'))
    directories.push(cwd)
    const packages = [
      { name: 'weapp-tailwindcss', directory: join(cwd, 'packages', 'core') },
      ...nativeNames.map((name, index) => ({ name, directory: join(cwd, 'packages-native', String(index)) })),
    ]
    const unchangedDirectory = join(cwd, 'packages', 'unchanged')
    await mkdir(join(cwd, '.changeset'))
    await mkdir(unchangedDirectory, { recursive: true })
    await writeFile(join(cwd, 'package.json'), JSON.stringify({ name: 'native-release-notes-fixture', private: true }))
    await writeFile(join(cwd, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\n  - packages-native/*\n')
    await writeFile(join(unchangedDirectory, 'package.json'), JSON.stringify({ name: '@fixture/unchanged', version: '1.0.0' }))
    await writeFile(join(unchangedDirectory, 'CHANGELOG.md'), '# @fixture/unchanged\n\n## 1.0.0\n\n- 历史变更。\n')
    const intent = join(cwd, '.changeset', 'native.md')
    await writeFile(intent, '---\n"weapp-tailwindcss": minor\n---\n\n新增可选 Rust 内核。\n')
    for (const pkg of packages) {
      await mkdir(pkg.directory, { recursive: true })
      await writeFile(join(pkg.directory, 'package.json'), JSON.stringify({ name: pkg.name, version: '5.5.12' }))
    }

    // 只替换进程与 GitHub 写入边界；发布说明由实际安装的 repoctl 生成。
    const spawn = vi.fn((command: string, args: string[]) => {
      let stdout = ''
      if (command === 'pnpm' && args[0] === 'version') {
        for (const pkg of packages) {
          writeFileSync(join(pkg.directory, 'package.json'), JSON.stringify({ name: pkg.name, version: '5.6.0' }))
          const content = pkg.name === 'weapp-tailwindcss' ? '\n### Minor Changes\n\n- 新增可选 Rust 内核。\n' : ''
          writeFileSync(join(pkg.directory, 'CHANGELOG.md'), `# ${pkg.name}\n\n## 5.6.0\n${content}`)
        }
        rmSync(intent)
        stdout = JSON.stringify(packages.map(({ name }) => ({ name, currentVersion: '5.5.12', newVersion: '5.6.0' })))
      }
      else {
        expect(command).toBe('git')
      }
      return { status: command === 'git' && args[0] === 'diff' ? 1 : 0, stdout, stderr: '' } as SpawnSyncReturns<string>
    })
    const ensurePullRequest = vi.fn(async (_request: { body: string }) => undefined)
    await createReleasePullRequest({
      cwd,
      branch: 'main',
      config: { qualityScripts: [] },
      env: { REPOCTL_LANG: locale },
      spawn: spawn as never,
      github: { ensurePullRequest } as never,
    })

    expect(ensurePullRequest).toHaveBeenCalledTimes(1)
    const { body } = ensurePullRequest.mock.calls[0]![0]
    expect(body).toContain(locale === 'zh-CN' ? '9 个包更新' : '9 packages updated')
    for (const name of nativeNames) {
      expect(body).toContain(`| \`${name}\` | [\`5.5.12\`]`)
      expect(body).toContain(`**${name}@5.6.0**: ${locale === 'zh-CN'
        ? '仅更新版本；未记录该包的独立变更说明。'
        : 'Version-only release; no package-specific changelog entries.'}`)
      expect(body).not.toContain(`**${name}@5.6.0**: 新增可选 Rust 内核。`)
    }
    expect(body).toContain('新增可选 Rust 内核。')
    expect(body).not.toContain('@fixture/unchanged')
    expect(spawn.mock.calls.some(([command, args]) => command === 'pnpm' && args.includes('publish'))).toBe(false)
  })
})
