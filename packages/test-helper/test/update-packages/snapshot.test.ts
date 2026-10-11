import { rm, symlink } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { compareSnapshots, importerKey, readSnapshot } from '../../../../scripts/update-packages/snapshot'
import { fixture } from './fixture'

describe('依赖更新前后快照', () => {
  it.each(['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'])(
    '记录 %s 的修改、新增与删除',
    async (section) => {
      const f = await fixture()
      await f.pkg('packages/a', { name: '@fixture/a', [section]: { changed: '^1', removed: '^1' } })
      const before = await readSnapshot(f.root)
      await f.pkg('packages/a', { name: '@fixture/a', [section]: { changed: '^2', added: '^1' } })
      const changes = compareSnapshots(before, await readSnapshot(f.root))
      expect(changes).toHaveLength(1)
      expect(changes[0]?.name).toBe('@fixture/a')
      expect(changes[0]?.dependencies.map(dep => [dep.section, dep.name])).toEqual([
        [section, 'added'],
        [section, 'changed'],
        [section, 'removed'],
      ])
    },
  )

  it('解析具名和默认 catalog，发现声明未改但范围变化的消费者', async () => {
    const f = await fixture()
    await f.pkg('packages/a', { name: 'a', dependencies: { lib: 'catalog:libs' } })
    await f.pkg('packages-runtime/b', { name: 'b', devDependencies: { tool: 'catalog:' } })
    await f.workspace({ catalog: { tool: '^1' }, catalogs: { libs: { lib: '^1' } } })
    const before = await readSnapshot(f.root)
    await f.workspace({ catalog: { tool: '^2' }, catalogs: { libs: { lib: '^2' } } })
    const changes = compareSnapshots(before, await readSnapshot(f.root))
    expect(changes.map(change => change.name)).toEqual(['a', 'b'])
    expect(changes[0]?.dependencies[0]).toMatchObject({ before: { declaration: 'catalog:libs', range: '^1' }, after: { range: '^2' } })
  })

  it('解析多文档锁文件的项目 importer，不受工具链和其他 importer 变化影响', async () => {
    const f = await fixture()
    await f.pkg('packages/a', { name: 'a', dependencies: { lib: '^1' } })
    const entry = (version: string) => ({ 'packages/a': { dependencies: { lib: { specifier: '^1', version } } } })
    await f.lock(entry('1.0.0'))
    const before = await readSnapshot(f.root)
    await f.lock({ ...entry('1.0.0'), 'demo/example': { dependencies: { lib: { version: '2.0.0' } } } }, '12.5.2')
    expect(compareSnapshots(before, await readSnapshot(f.root))).toEqual([])
    await f.lock(entry('1.1.0'))
    expect(compareSnapshots(before, await readSnapshot(f.root))[0]?.dependencies[0])
      .toMatchObject({ before: { resolved: '1.0.0' }, after: { resolved: '1.1.0' } })
  })

  it('只记录本次变化，排除 demo、private、workspace glob 排除的包与间接消费者', async () => {
    const f = await fixture()
    await f.workspace({ packages: ['packages/*', 'packages-runtime/*', 'demo/*', '!packages/excluded'] })
    for (const dir of ['packages/a', 'packages/private', 'demo/a', 'packages/excluded']) {
      await f.pkg(dir, { name: dir, private: dir === 'packages/private', dependencies: { lib: '^2' } })
    }
    await f.pkg('packages/consumer', { name: 'consumer', dependencies: { 'packages/a': 'workspace:*' } })
    const before = await readSnapshot(f.root)
    expect(compareSnapshots(before, await readSnapshot(f.root))).toEqual([])
    for (const dir of ['packages/a', 'packages/private', 'demo/a', 'packages/excluded']) {
      await f.pkg(dir, { name: dir, private: dir === 'packages/private', dependencies: { lib: '^3' } })
    }
    expect(compareSnapshots(before, await readSnapshot(f.root)).map(change => change.name)).toEqual(['packages/a'])
  })

  it('锁文件语法错误和无法解析的 catalog 必须报错', async () => {
    const f = await fixture()
    await f.write('pnpm-lock.yaml', 'importers: [')
    await expect(readSnapshot(f.root)).rejects.toThrow()
    await f.lock({})
    await f.pkg('packages/a', { name: 'a', dependencies: { lib: 'catalog:missing' } })
    await expect(readSnapshot(f.root)).rejects.toThrow(/catalog/)
  })

  it('兼容单文档、缺失锁文件、默认 catalog 别名和自动安装的 peer', async () => {
    const f = await fixture()
    await f.pkg('packages/a', { name: 'a', peerDependencies: { lib: 'catalog:default' } })
    await f.workspace({ catalogs: { default: { lib: '^1' } } })
    await rm(path.join(f.root, 'pnpm-lock.yaml'))
    expect((await readSnapshot(f.root)).size).toBe(1)
    await f.write('pnpm-lock.yaml', 'lockfileVersion: "9.0"\nimporters:\n  packages/a:\n    dependencies:\n      lib:\n        specifier: "^1"\n        version: 1.0.0\n')
    const before = await readSnapshot(f.root)
    await f.write('pnpm-lock.yaml', (await f.read('pnpm-lock.yaml')).replace('1.0.0', '1.1.0'))
    expect(compareSnapshots(before, await readSnapshot(f.root))[0]?.dependencies[0])
      .toMatchObject({ section: 'peerDependencies', before: { resolved: '1.0.0' }, after: { resolved: '1.1.0' } })
  })

  it('通过目录别名读取的 workspace 与真实路径一致', async () => {
    const f = await fixture()
    const aliasParent = await fixture()
    await f.pkg('packages/a', { name: 'a', dependencies: { lib: '^1' } })
    const alias = path.join(aliasParent.root, 'workspace-alias')
    await symlink(f.root, alias, 'junction')
    expect(await readSnapshot(alias)).toEqual(await readSnapshot(f.root))
  })

  it.each([
    [path.posix, '/repo', '/repo/packages/a', 'packages/a'],
    [path.posix, '/', '/packages/a', 'packages/a'],
    [path.posix, '/repo', './packages/a', 'packages/a'],
    [path.win32, 'C:\\repo', 'C:\\repo\\packages\\a', 'packages/a'],
    [path.win32, 'C:\\', 'C:\\packages\\a', 'packages/a'],
    [path.win32, 'C:\\repo', '.\\packages\\a', 'packages/a'],
    [path.win32, 'C:\\repo', 'C:\\repo', '.'],
  ])('在锁文件边界转换路径 %s %s %s', (paths, root, dir, expected) => {
    expect(importerKey(root, dir, paths)).toBe(expected)
  })
})
