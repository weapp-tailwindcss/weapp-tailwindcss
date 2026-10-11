import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
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
    const manifest = { name: 'frozen-config-fixture', private: true, dependencies: { 'frozen-local-dependency': 'workspace:*' } }
    const environment = {
      ...process.env,
      CI: '1',
      npm_config_update: 'true',
      PNPM_INSTALL_ATTEMPTS: '1',
      PNPM_INSTALL_TIMEOUT_MS: '15000',
    }
    const runOptions = { cwd: directory, env: environment, encoding: 'utf8' as const, timeout: 20000, maxBuffer: 1024 ** 2, windowsHide: true }
    const runInstaller = () => spawnSync(process.execPath, [installer], runOptions)

    try {
      await writeFile(path.join(directory, 'package.json'), JSON.stringify(manifest))
      await writeFile(path.join(directory, 'pnpm-workspace.yaml'), `packages:
  - packages/*
update:
  ignoreDeps:
    - frozen-local-dependency
`)
      for (const name of ['frozen-local-dependency', 'frozen-extra-dependency']) {
        const dependency = path.join(directory, 'packages', name)
        await mkdir(dependency, { recursive: true })
        await writeFile(path.join(dependency, 'package.json'), JSON.stringify({ name, version: '1.0.0' }))
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
      const lockFile = path.join(directory, 'pnpm-lock.yaml')
      const workspaceFile = path.join(directory, 'pnpm-workspace.yaml')
      const originalLock = await readFile(lockFile, 'utf8')
      const originalWorkspace = await readFile(workspaceFile, 'utf8')

      const installed = runInstaller()
      expect(installed.status, installed.stdout + installed.stderr).toBe(0)
      expect(installed.stdout).toContain('Lockfile is up to date, resolution step is skipped')
      expect(installed.stdout).toContain(`using pnpm v${pnpmVersion}`)
      expect(await readFile(lockFile, 'utf8')).toBe(originalLock)
      expect(await readFile(workspaceFile, 'utf8')).toBe(originalWorkspace)

      await writeFile(path.join(directory, 'package.json'), JSON.stringify({
        ...manifest,
        dependencies: { ...manifest.dependencies, 'frozen-extra-dependency': 'workspace:*' },
      }))
      const drifted = runInstaller()
      expect(drifted.status, drifted.stdout + drifted.stderr).not.toBe(0)
      expect(drifted.stdout + drifted.stderr).toContain('ERR_PNPM_OUTDATED_LOCKFILE')
      expect(await readFile(lockFile, 'utf8')).toBe(originalLock)
      expect(await readFile(workspaceFile, 'utf8')).toBe(originalWorkspace)
      expect(environment.npm_config_update).toBe('true')
    }
    finally {
      await rm(directory, { recursive: true, force: true })
    }
  }, 60000)
})
