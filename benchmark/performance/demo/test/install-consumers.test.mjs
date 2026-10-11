import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { expect, it } from 'vitest'
import { isolateInstallConsumers } from '../install-consumers.mjs'

it('安装实验保留源码和精确锁文件，删除重装不影响已准备的构建依赖', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'cost-install-'))
  try {
    const root = path.join(directory, 'build')
    const project = path.join(root, 'demo', 'nested', 'project')
    const modules = path.join(project, 'node_modules')
    await mkdir(modules, { recursive: true })
    await writeFile(path.join(modules, 'runtime.js'), '框架已改写的运行时')
    await symlink(modules, path.join(root, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir')
    await writeFile(path.join(project, 'package.json'), '{"scripts":{"postinstall":"node setup.cjs"}}')
    await writeFile(path.join(project, 'setup.cjs'), 'install source')
    await writeFile(path.join(project, 'pnpm-lock.yaml'), '完整锁文件')
    const original = { enabled: { root, project, mode: 'enabled' } }
    const { enabled } = await isolateInstallConsumers(original, path.join(directory, 'install'))
    expect(await readFile(path.join(enabled.project, 'pnpm-lock.yaml'), 'utf8')).toBe('完整锁文件')
    expect(await readFile(path.join(enabled.project, 'setup.cjs'), 'utf8')).toBe('install source')
    await expect(readFile(path.join(enabled.project, 'node_modules', 'runtime.js'))).rejects.toThrow()
    await writeFile(path.join(enabled.project, 'pnpm-lock.yaml'), '增量安装锁文件')
    await rm(enabled.root, { recursive: true, force: true })
    expect(await readFile(path.join(modules, 'runtime.js'), 'utf8')).toBe('框架已改写的运行时')
    expect(await readFile(path.join(project, 'pnpm-lock.yaml'), 'utf8')).toBe('完整锁文件')
    await expect(isolateInstallConsumers(original, path.join(root, 'nested'))).rejects.toThrow('重叠')
  }
  finally { await rm(directory, { recursive: true, force: true }) }
})
