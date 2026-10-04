import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import process from 'node:process'
import { execa } from 'execa'
import { declaredPackageManager } from '../../scripts/ci/version-contract.mjs'
import { createPnpmCommand } from '../../scripts/pnpm-command.mjs'
import { createPreparationReport } from './preparation-report'

export const dependencyVersions = {
  '@dcloudio/uni-app': '3.0.0-5010520260709002',
  '@dcloudio/uni-mp-weixin': '3.0.0-5010520260709002',
  '@dcloudio/uni-components': '3.0.0-5010520260709002',
  '@dcloudio/vite-plugin-uni': '3.0.0-5010520260709002',
  'vue': '3.5.42',
  'vite': '5.2.8',
  'tailwindcss': '4.3.3',
}

/** 框架依赖保留原始版本；临时工程与仓库使用同一 pnpm，准备失败同样保存证据。 */
export async function prepareDependencies(temporary: string, artifacts = path.join(temporary, 'preparation')) {
  const reused = process.env['E2E_ISSUE_1241_DEPENDENCIES']
  const root = reused ?? path.join(temporary, 'dependencies')
  const repository = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8'))
  const expected = declaredPackageManager(repository)
  const report = createPreparationReport(artifacts, { root, temporary, reused: Boolean(reused), packageManager: repository.packageManager, dependencies: dependencyVersions })
  try {
    await report.phase('manifest')
    if (!reused) {
      await mkdir(root, { recursive: true })
      await writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'issue-1241-framework', private: true, packageManager: repository.packageManager, dependencies: dependencyVersions }, null, 2))
    }
    else {
      const manifest = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'))
      assert.equal(manifest.packageManager, repository.packageManager, '复用项目的 pnpm 声明与仓库不符')
    }
    await report.phase('verify-pnpm')
    const versionCommand = createPnpmCommand(['--version'])
    await report.command(versionCommand)
    const version = await execa(versionCommand.command, versionCommand.args, { cwd: root, shell: versionCommand.shell, timeout: 120_000 })
    await report.output('version.log', version)
    await report.pnpm(version.stdout.trim())
    assert.equal(version.stdout.trim(), expected.version, `pnpm 版本不符，要求 ${repository.packageManager}`)
    if (!reused) {
      await report.phase('install')
      const command = createPnpmCommand(['install', '--ignore-scripts'])
      await report.command(command)
      const result = await execa(command.command, command.args, { cwd: root, shell: command.shell, timeout: 120_000 })
      await report.output('install.log', result)
    }
    await report.phase('verify-dependencies')
    const require = createRequire(path.join(root, 'package.json'))
    for (const [name, version] of Object.entries(dependencyVersions)) {
      const manifest = JSON.parse(await readFile(require.resolve(`${name}/package.json`), 'utf8'))
      assert.equal(manifest.version, version, `复现依赖版本不符：${name}`)
    }
    await report.passed()
    return root
  }
  catch (error) {
    try {
      await report.failed(error)
    }
    catch (reportError) {
      throw new AggregateError([error, reportError], `Issue 1241 安装准备和证据保存均失败：${artifacts}`, { cause: error })
    }
    throw new Error(`Issue 1241 安装准备失败：${String(error)}；证据：${artifacts}`, { cause: error })
  }
}
