import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { collectTestOwnership, ownershipCollections, parseOwnershipCommand, verifyTestOwnership, viteIntegrationExclude, viteIntegrationFile } from '../../../../scripts/ci/unit-test-ownership.mjs'

describe('单测与 Vite 集成测试的文件所有权', () => {
  it('精确解析执行命令，并将 CLI 排除追加到每个项目', async () => {
    const commands = ownershipCollections()
    const original = structuredClone(commands)
    const parsed = await parseOwnershipCommand(commands[1]!)
    expect(parsed.filters).toEqual([])
    expect(parsed.options).toMatchObject({ run: true, shard: '1/3', maxWorkers: 2, update: 'none', cliExclude: [viteIntegrationExclude] })
    expect(parsed.options.exclude).toBeUndefined()
    expect((await parseOwnershipCommand(commands[4]!)).filters).toEqual([viteIntegrationFile])
    expect(commands).toEqual(original)
  })

  it('独立子进程按 CLI 排除目标，连续收集保持真实分片和项目配置隔离', async () => {
    const temporary = await mkdtemp(path.join(tmpdir(), 'weapp unit ownership-'))
    const root = path.join(temporary, 'project')
    try {
      const project = path.join(root, 'packages', 'weapp-tailwindcss')
      const other = path.join(root, 'packages', 'other')
      const target = path.join(root, viteIntegrationFile)
      await Promise.all([
        mkdir(path.dirname(target), { recursive: true }),
        mkdir(path.join(other, 'test'), { recursive: true }),
      ])
      const projectConfig = (name: string) => `import { fileURLToPath } from 'node:url'\nexport default { root: fileURLToPath(new URL('.', import.meta.url)), test: { name: '${name}', include: ['test/**/*.test.ts'] } }\n`
      await Promise.all([
        writeFile(path.join(root, 'vitest.config.mjs'), 'export default { test: { projects: ["./packages/weapp-tailwindcss", "./packages/other"] } }\n'),
        writeFile(path.join(project, 'vitest.config.mjs'), projectConfig('weapp-tailwindcss')),
        writeFile(path.join(other, 'vitest.config.mjs'), projectConfig('another-project')),
        ...[
          target,
          path.join(project, 'test', 'postcss.test.ts'),
          path.join(project, 'test', 'compiler.test.ts'),
          path.join(other, 'test', 'postcss.test.ts'),
          path.join(other, 'test', 'extra.test.ts'),
        ].map(file => writeFile(file, 'throw new Error("所有权检查只能发现文件，不能执行测试模块")\n')),
      ])
      const result = await collectTestOwnership(root)
      expect(result.total).toBe(5)
      expect(result.integration).toBe(1)
      expect(result.shards).toHaveLength(3)
      expect(result.shards.reduce((sum: number, count: number) => sum + count, 0)).toBe(4)
      const alias = path.join(temporary, 'project-alias')
      await symlink(root, alias, process.platform === 'win32' ? 'junction' : 'dir')
      expect(await collectTestOwnership(alias)).toEqual(result)
      await writeFile(path.join(root, 'vitest.config.mjs'), 'throw new Error("所有权子进程配置失败证据")\n')
      await expect(collectTestOwnership(root)).rejects.toThrow('所有权子进程配置失败证据')
    }
    finally {
      await rm(temporary, { recursive: true, force: true })
    }
  }, 180_000)

  it.each([
    { platform: 'POSIX', paths: path.posix, root: '/workspace/repo' },
    { platform: 'Windows 盘符', paths: path.win32, root: 'D:\\workspace\\repo' },
    { platform: 'Windows 根目录', paths: path.win32, root: '\\workspace\\repo' },
  ])('$platform 下按项目与文件身份保留全集并拒绝重复或缺失', ({ paths, root }) => {
    const target = { projectName: 'weapp-tailwindcss', file: paths.resolve(root, viteIntegrationFile) }
    const css = { projectName: 'weapp-tailwindcss', file: paths.resolve(root, 'packages', 'weapp-tailwindcss', 'test', 'postcss.test.ts') }
    const otherProject = { ...css, projectName: 'another-project' }
    const all = [target, css, otherProject]
    expect(verifyTestOwnership(all, [[css], [otherProject], []], [target], root, paths))
      .toEqual({ total: 3, shards: [1, 1, 0], integration: 1 })
    expect(() => verifyTestOwnership(all, [[css], [otherProject], [target]], [target], root, paths))
      .toThrow('测试文件重复归属')
    expect(() => verifyTestOwnership(all, [[css], [], []], [target], root, paths))
      .toThrow('遗漏默认测试文件')
  })

  it('同一项目的绝对与相对路径不能绕过重复归属检查', () => {
    const root = '/workspace/repo'
    const target = { projectName: 'weapp-tailwindcss', file: viteIntegrationFile }
    const duplicate = { ...target, file: path.posix.resolve(root, viteIntegrationFile) }
    expect(() => verifyTestOwnership([target], [[duplicate], [], []], [target], root, path.posix))
      .toThrow('测试文件重复归属')
  })

  it('Windows 的逻辑斜杠与文件系统反斜杠对应同一测试身份', () => {
    const root = 'C:\\workspace\\repo'
    const target = { projectName: 'weapp-tailwindcss', file: `C:/workspace/repo/${viteIntegrationFile}` }
    const duplicate = { ...target, file: path.win32.resolve(root, viteIntegrationFile) }
    expect(() => verifyTestOwnership([target], [[duplicate], [], []], [target], root, path.win32))
      .toThrow('测试文件重复归属')
  })

  it('Vite 作业必须只执行目标文件，不能执行空集合或其他文件', () => {
    const target = { file: viteIntegrationFile }
    const css = { file: 'packages/weapp-tailwindcss/test/postcss.test.ts' }
    for (const integration of [[], [css], [target, css]]) {
      expect(() => verifyTestOwnership([target, css], [[css], [], []], integration, '/repo', path.posix))
        .toThrow('必须精确执行原版本矩阵文件')
    }
  })

  it('不能静默接受额外文件、重复清单或错误分片数量', () => {
    const target = { file: viteIntegrationFile }
    const css = { file: 'packages/weapp-tailwindcss/test/postcss.test.ts' }
    expect(() => verifyTestOwnership([target], [[css], [], []], [target], '/repo', path.posix))
      .toThrow('默认集合之外')
    expect(() => verifyTestOwnership([target, target], [[], [], []], [target], '/repo', path.posix))
      .toThrow('存在重复')
    expect(() => verifyTestOwnership([target, css], [[css, css], [], []], [target], '/repo', path.posix))
      .toThrow('存在重复')
    expect(() => verifyTestOwnership([target], [[], []], [target], '/repo', path.posix))
      .toThrow('必须保留三个分片')
  })

  it.each([
    { all: [] },
    { all: [{ file: 'packages/other/test.spec.ts' }] },
    { all: [{ file: viteIntegrationFile, projectName: 'first' }, { file: viteIntegrationFile, projectName: 'second' }] },
  ])('默认集合必须包含唯一版本矩阵身份：$all', ({ all }) => {
    expect(() => verifyTestOwnership(all, [[], [], []], [], '/repo', path.posix)).toThrow()
  })

  it.each([
    { paths: path.posix, root: '/repo', file: '../outside.test.ts' },
    { paths: path.win32, root: 'C:\\repo', file: 'D:\\outside.test.ts' },
    { paths: path.win32, root: 'C:\\repo', file: '..\\outside.test.ts' },
  ])('拒绝仓库外的文件身份：$file', ({ paths, root, file }) => {
    expect(() => verifyTestOwnership([{ file }], [[], [], []], [], root, paths)).toThrow('必须属于仓库')
  })
})
