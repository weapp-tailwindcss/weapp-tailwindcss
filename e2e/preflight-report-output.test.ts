import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { execa } from 'execa'
import { expect, it } from 'vitest'
import { createDemoE2eMemoryReport, writeDemoE2eMemoryReport } from '../scripts/demo-e2e-memory'
import { collectIdentity } from '../scripts/e2e-preflight/io'

it('每阶段写入内存报告不改变全面测试的源码身份，实际源码编辑仍能被检测', async () => {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), 'weapp-tw-report-identity-')))
  try {
    await writeFile(path.join(root, '.gitignore'), 'e2e/.artifacts/\n')
    await writeFile(path.join(root, 'source.ts'), 'export const value = 1\n')
    const git = (...args: string[]) => execa('git', args, { cwd: root })
    await git('init')
    await git('add', '.gitignore', 'source.ts')
    await git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.test', 'commit', '-m', 'fixture')
    const before = await collectIdentity(root)
    const report = createDemoE2eMemoryReport({ repositoryRoot: root, includeLocal: true, exitCode: 0, steps: [] })
    const output = await writeDemoE2eMemoryReport({ report })
    expect(JSON.parse(await readFile(output.jsonFile, 'utf8')).repositoryRoot).toBe(root)
    expect((await collectIdentity(root)).source).toBe(before.source)
    await writeDemoE2eMemoryReport({ report: { ...report, exitCode: 1 } })
    expect((await collectIdentity(root)).source).toBe(before.source)
    await writeFile(path.join(root, 'source.ts'), 'export const value = 2\n')
    expect((await collectIdentity(root)).source).not.toBe(before.source)
  }
  finally {
    await rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
  }
})
