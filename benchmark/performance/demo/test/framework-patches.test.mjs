import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { parse, stringify } from 'yaml'
import { expect, it } from 'vitest'
import { prepareFrameworkPatches } from '../framework-patches.mjs'
import { pruneLock } from '../lock.mjs'
import { compareCommonLocks } from '../fixtures.mjs'

it('三组复制匹配确切发布版本的相同框架补丁，并保留原始文件与哈希', async () => {
  const repository = await mkdtemp(path.join(os.tmpdir(), 'cost-patches-'))
  try {
    await mkdir(path.join(repository, 'patches'))
    const content = '工具链补丁内容\n'
    await writeFile(path.join(repository, 'patches', 'rollup.patch'), content)
    await writeFile(path.join(repository, 'pnpm-workspace.yaml'), stringify({ patchedDependencies: { 'rollup@4.63.1': path.join('patches', 'rollup.patch'), 'rollup@3.30.0': 'absent.patch' } }))
    const evidence = []
    for (const mode of ['native', 'static', 'enabled']) {
      const project = path.join(repository, mode)
      await mkdir(project)
      await writeFile(path.join(project, 'pnpm-workspace.yaml'), 'packages: [.]\nnodeLinker: hoisted\n')
      const patches = await prepareFrameworkPatches(project, { packages: { 'rollup@4.63.1': {} } }, repository)
      const patch = patches['rollup@4.63.1']
      expect(Object.keys(patches)).toEqual(['rollup@4.63.1'])
      expect(patch.sha256).toBe(createHash('sha256').update(content).digest('hex'))
      expect(await readFile(path.join(project, patch.path), 'utf8')).toBe(content)
      expect(parse(await readFile(path.join(project, 'pnpm-workspace.yaml'), 'utf8'))).toEqual({ packages: ['.'], nodeLinker: 'hoisted', patchedDependencies: { 'rollup@4.63.1': patch.path } })
      evidence.push(patches)
    }
    expect(evidence[0]).toEqual(evidence[1])
    expect(evidence[1]).toEqual(evidence[2])
    await writeFile(path.join(repository, 'pnpm-workspace.yaml'), stringify({ patchedDependencies: { 'weapp-tailwindcss@5.5.11': 'absent.patch' } }))
    await expect(prepareFrameworkPatches(repository, { packages: { 'weapp-tailwindcss@5.5.11': {} } }, repository)).rejects.toThrow('不得修改被测发布包')
  }
  finally { await rm(repository, { recursive: true, force: true }) }
})

it('冻结安装的裁剪锁保留可达补丁及其 snapshot 身份', () => {
  const version = '4.63.1(patch_hash=verified)'
  const patch = { hash: 'verified', path: path.join('.cost', 'framework-patches', 'verified.patch') }
  const importer = { dependencies: { rollup: { version } } }
  const lock = { lockfileVersion: '9.0', packages: { 'rollup@4.63.1': {} }, snapshots: { [`rollup@${version}`]: {} }, patchedDependencies: { 'rollup@4.63.1': patch, 'unused@1.0.0': {} } }
  const result = pruneLock(lock, importer)
  expect(result.patchedDependencies).toEqual({ 'rollup@4.63.1': patch })
  expect(result.snapshots).toEqual(lock.snapshots)
})

it('相同发布依赖不能在对照组中使用不同框架补丁', () => {
  const lock = { importers: { '.': {} }, packages: { 'rollup@4.63.1': { resolution: { integrity: 'same' } } }, patchedDependencies: { 'rollup@4.63.1': 'hash-a' } }
  expect(() => compareCommonLocks(lock, structuredClone(lock))).not.toThrow()
  expect(() => compareCommonLocks(lock, { ...lock, patchedDependencies: {} })).toThrow('框架补丁不同')
  expect(() => compareCommonLocks(lock, { ...lock, patchedDependencies: { 'rollup@4.63.1': 'hash-b' } })).toThrow('框架补丁不同')
})
