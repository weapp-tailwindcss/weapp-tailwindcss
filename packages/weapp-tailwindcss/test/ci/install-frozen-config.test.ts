import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { createPnpmCommand } from '../../../../scripts/pnpm-command.mjs'

const installer = fileURLToPath(new URL('../../../../scripts/ci/install-workspace.mjs', import.meta.url))

describe('真实 pnpm 的冻结安装配置边界', () => {
  it('更新配置及环境不会触发重新解析，锁文件漂移必须在安装前失败', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'pnpm-frozen-config-'))
    const manifest = { name: 'frozen-config-fixture', private: true, dependencies: { 'frozen-local-dependency': 'file:local-dependencies/frozen-local-dependency' } }
    const resolutionProbe = path.join(directory, 'resolution.log')
    const installedManifest = path.join(directory, 'node_modules', 'frozen-local-dependency', 'package.json')
    const environment = {
      ...process.env,
      CI: '1',
      npm_config_update: 'true',
      PNPM_INSTALL_ATTEMPTS: '1',
      PNPM_INSTALL_TIMEOUT_MS: '15000',
      PNPM_FROZEN_RESOLUTION_PROBE: resolutionProbe,
    }
    const runOptions = { cwd: directory, env: environment, encoding: 'utf8' as const, timeout: 20000, maxBuffer: 1024 ** 2, windowsHide: true }
    const runInstaller = () => spawnSync(process.execPath, [installer], runOptions)

    try {
      await writeFile(path.join(directory, 'package.json'), JSON.stringify(manifest))
      await writeFile(path.join(directory, '.pnpmfile.cjs'), `const { appendFileSync } = require('node:fs');
exports.hooks = { afterAllResolved(lockfile) { appendFileSync(process.env.PNPM_FROZEN_RESOLUTION_PROBE, 'resolved\\n'); return lockfile; } };
`)
      await writeFile(path.join(directory, 'pnpm-workspace.yaml'), `packages:
  - packages/*
update:
  ignoreDeps:
    - frozen-local-dependency
`)
      for (const name of ['frozen-local-dependency', 'frozen-extra-dependency']) {
        const dependency = path.join(directory, name === 'frozen-local-dependency' ? 'local-dependencies' : 'packages', name)
        await mkdir(dependency, { recursive: true })
        await writeFile(path.join(dependency, 'package.json'), JSON.stringify({ name, version: '1.0.0' }))
        await writeFile(path.join(dependency, 'index.js'), `module.exports = "${name}";\n`)
      }

      const versionCommand = createPnpmCommand(['--version'])
      const version = spawnSync(versionCommand.command, versionCommand.args, { ...runOptions, shell: versionCommand.shell })
      expect(version.status, version.stdout + version.stderr).toBe(0)
      const pnpmVersion = version.stdout.trim()
      expect(pnpmVersion).toMatch(/^\d+\.\d+\.\d+$/)
      // eslint-disable-next-line no-console -- 保留真实工具链身份，避免将启动命令误当作实际 CLI 版本。
      console.log(`冻结安装真实工具链：${JSON.stringify({ node: process.execPath, nodeVersion: process.version, command: versionCommand, pnpmVersion })}`)

      const command = createPnpmCommand(['install', '--lockfile-only', '--ignore-scripts', '--config.update=false'])
      const generated = spawnSync(command.command, command.args, { ...runOptions, shell: command.shell })
      expect(generated.status, generated.stdout + generated.stderr).toBe(0)
      expect(generated.stdout).toContain(`using pnpm v${pnpmVersion}`)
      // 先证明解析探针已真实执行，避免把未加载的钩子误当作跳过解析。
      expect(await readFile(resolutionProbe, 'utf8')).toBe('resolved\n')
      await rm(resolutionProbe)
      await expect(readFile(installedManifest, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
      const lockFile = path.join(directory, 'pnpm-lock.yaml')
      const workspaceFile = path.join(directory, 'pnpm-workspace.yaml')
      const originalLock = await readFile(lockFile, 'utf8')
      const originalWorkspace = await readFile(workspaceFile, 'utf8')

      const installed = runInstaller()
      expect(installed.status, installed.stdout + installed.stderr).toBe(0)
      expect(installed.stdout).toContain(`using pnpm v${pnpmVersion}`)
      // afterAllResolved 只属于解析生命周期；实际安装物化文件证明冻结路径完成了锁文件消费。
      await expect(readFile(resolutionProbe, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
      expect(JSON.parse(await readFile(installedManifest, 'utf8')))
        .toEqual({ name: 'frozen-local-dependency', version: '1.0.0' })
      const installedSource = path.join(directory, 'node_modules', 'frozen-local-dependency', 'index.js')
      expect(await readFile(installedSource, 'utf8')).toBe('module.exports = "frozen-local-dependency";\n')
      expect(await realpath(installedSource)).not.toBe(await realpath(path.join(directory, 'local-dependencies', 'frozen-local-dependency', 'index.js')))
      expect(await readFile(lockFile, 'utf8')).toBe(originalLock)
      expect(await readFile(workspaceFile, 'utf8')).toBe(originalWorkspace)

      await writeFile(path.join(directory, 'package.json'), JSON.stringify({
        ...manifest,
        dependencies: { ...manifest.dependencies, 'frozen-extra-dependency': 'workspace:*' },
      }))
      const drifted = runInstaller()
      expect(drifted.status, drifted.stdout + drifted.stderr).not.toBe(0)
      expect(drifted.stdout + drifted.stderr).toContain('ERR_PNPM_OUTDATED_LOCKFILE')
      await expect(readFile(resolutionProbe, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
      expect(await readFile(lockFile, 'utf8')).toBe(originalLock)
      expect(await readFile(workspaceFile, 'utf8')).toBe(originalWorkspace)
      expect(environment.npm_config_update).toBe('true')
    }
    finally {
      // Windows 在 pnpm 退出后可能短暂保留目录句柄；交给 fs.rm 有界退避，持续占用仍报错。
      await rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
    }
    await expect(stat(directory)).rejects.toMatchObject({ code: 'ENOENT' })
  }, 60000)
})
