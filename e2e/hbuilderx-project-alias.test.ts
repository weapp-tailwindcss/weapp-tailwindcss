import fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { describe, expect, it } from 'vitest'
import { createHBuilderXProjectAlias, createHBuilderXProjectAliasName } from '../scripts/hbuilderx-project-alias.mjs'

describe('HBuilderX project alias', () => {
  it('separates same-name projects from different worktrees', () => {
    const main = createHBuilderXProjectAliasName('/repo/main/demo/uni-app-x', 42)
    const worktree = createHBuilderXProjectAliasName('/repo/worktree/demo/uni-app-x', 42)

    expect(main).not.toBe(worktree)
    expect(main).toMatch(/^uni-app-x-[a-f0-9]{10}-42$/)
    expect(worktree).toMatch(/^uni-app-x-[a-f0-9]{10}-42$/)
  })

  it('separates concurrent launches of the same project', () => {
    const first = createHBuilderXProjectAliasName('/repo/demo/uni-app-x', 42)
    const second = createHBuilderXProjectAliasName('/repo/demo/uni-app-x', 43)

    expect(first).not.toBe(second)
  })

  it.each(['absolute', 'relative'])('%s 别名根目录返回绝对路径并保持源码同步', async (mode) => {
    const projectRoot = await fs.mkdtemp(path.join(tmpdir(), 'hbuilderx-project-alias-source-'))
    const sourceFile = path.join(projectRoot, 'pages.uvue')
    await fs.writeFile(sourceFile, 'before')
    const aliasRoot = path.join(projectRoot, '中文 & aliases')
    const alias = await createHBuilderXProjectAlias(projectRoot, mode === 'relative' ? path.relative(process.cwd(), aliasRoot) : aliasRoot)
    try {
      expect(path.isAbsolute(alias.projectPath)).toBe(true)
      await fs.writeFile(path.join(alias.projectPath, 'pages.uvue'), 'after')
      expect(await fs.readFile(sourceFile, 'utf8')).toBe('after')
    }
    finally {
      await alias.cleanup()
      await fs.rm(projectRoot, { recursive: true, force: true })
    }
  })
  it('同一进程再次领取同一项目也不覆盖待恢复的别名', async () => {
    const projectRoot = await fs.mkdtemp(path.join(tmpdir(), 'hbuilderx-alias-recovery-'))
    const aliasRoot = path.join(projectRoot, 'aliases')
    const first = await createHBuilderXProjectAlias(projectRoot, aliasRoot)
    try {
      const second = await createHBuilderXProjectAlias(projectRoot, aliasRoot)
      try {
        expect(second.projectPath).not.toBe(first.projectPath)
        expect(second.projectName).not.toBe(first.projectName)
        await first.cleanup()
        expect((await fs.lstat(second.projectPath)).isSymbolicLink()).toBe(true)
        await fs.writeFile(path.join(second.projectPath, 'probe.txt'), 'current')
        expect(await fs.readFile(path.join(projectRoot, 'probe.txt'), 'utf8')).toBe('current')
      }
      finally {
        await second.cleanup()
      }
    }
    finally {
      await first.cleanup()
      await fs.rm(projectRoot, { recursive: true, force: true })
    }
  })
})
