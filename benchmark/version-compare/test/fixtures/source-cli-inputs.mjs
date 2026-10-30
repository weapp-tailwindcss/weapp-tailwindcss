import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { promisify } from 'node:util'
import { fileReceipt } from '../../scripts/source-diagnostics/files.mjs'
import { kinds } from '../../scripts/source-diagnostics/inputs.mjs'
import { executeCommand } from '../../scripts/source-diagnostics/prepare.mjs'

const exec = promisify(execFile)
export async function write(root, logical, text) {
  const file = path.join(root, ...logical.split('/'))
  await fs.mkdir(path.dirname(file), { recursive: true })
  await fs.writeFile(file, text)
  return file
}

/** 使用真实 Git/tar 来源与真实 Node 包解析；仅模拟每侧 pnpm install/build。 */
export async function cliInputFixture(kind, behavior = {}) {
  const definition = kinds[kind]
  const parent = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'source-cli-inputs-')))
  const sourceRepository = path.join(parent, 'source')
  await fs.mkdir(sourceRepository)
  const git = async args => (await exec('git', args, { cwd: sourceRepository, shell: false, encoding: 'utf8' })).stdout.trim()
  await git(['init'])
  await write(sourceRepository, '.gitignore', 'node_modules/\n**/dist/\n')
  await write(sourceRepository, 'package.json', JSON.stringify({ name: 'fixture-root', private: true, type: 'module', packageManager: 'pnpm@12.15.0', engines: { node: '>=22' } }))
  await write(sourceRepository, 'pnpm-lock.yaml', 'lockfileVersion: 9.0\n')
  await write(sourceRepository, 'pnpm-workspace.yaml', 'packages: []\n')
  await write(sourceRepository, `${definition.project}/package.json`, JSON.stringify({ name: `fixture-${kind}`, private: true, type: 'module' }))
  await write(sourceRepository, `${definition.project}/${kind === 'taro' ? 'config/index.ts' : 'vite.config.ts'}`, 'export default {}\n')
  for (const file of definition.sources) {
    await write(sourceRepository, file, 'export const fixture = true\n')
  }
  for (const [directory, name] of [['packages/weapp-tailwindcss', 'weapp-tailwindcss'], ['packages/postcss', '@weapp-tailwindcss/postcss']]) {
    const main = behavior.workspaceEntry ?? './dist/index.cjs'
    const exported = { import: './dist/index.mjs', require: main }
    if (behavior.workspaceNodeCondition) {
      Object.assign(exported, { node: './missing-node.cjs' })
      delete exported.require
      exported.require = main
    }
    await write(sourceRepository, `${directory}/package.json`, JSON.stringify({ name, version: '1.0.0-fixture', type: 'module', main, exports: { '.': exported } }))
  }
  const commit = async (note) => {
    await write(sourceRepository, 'source-note.txt', `${note}\n`)
    await git(['add', '-A'])
    await git(['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', note])
    return git(['rev-parse', 'HEAD'])
  }
  const base = await commit('base')
  const current = await commit('current')
  const pnpmEntry = await write(parent, 'pnpm.cjs', '// 仅记录身份，夹具不会执行此文件。\n')
  const calls = []
  const execute = async (request) => {
    if (request.executable !== process.execPath || request.args[0] !== pnpmEntry) {
      return executeCommand(request)
    }
    const args = request.args.slice(1)
    calls.push({ cwd: request.cwd, args })
    if (args[0] === 'install') {
      const project = path.join(request.cwd, ...definition.project.split('/'))
      for (const directory of [path.join(request.cwd, 'node_modules', '.pnpm'), path.join(request.cwd, 'node_modules', '.bin'), path.join(project, 'node_modules', '.bin')]) {
        await fs.mkdir(directory, { recursive: true })
      }
      for (const [name, target] of [['weapp-tailwindcss', 'packages/weapp-tailwindcss'], ['@weapp-tailwindcss/postcss', 'packages/postcss']]) {
        const link = path.join(request.cwd, 'node_modules', ...name.split('/'))
        await fs.mkdir(path.dirname(link), { recursive: true })
        await fs.symlink(path.join(request.cwd, ...target.split('/')), link, process.platform === 'win32' ? 'junction' : 'dir')
      }
      for (const name of definition.packages.filter(name => !['weapp-tailwindcss', '@weapp-tailwindcss/postcss'].includes(name))) {
        const directory = path.join(request.cwd, 'node_modules', '.pnpm', `${name.replaceAll('/', '+')}-fixture`, 'node_modules', ...name.split('/'))
        const cli = definition.binary[0] === name
        const entry = cli ? './dist/index.mjs' : './dist/index.cjs'
        let exported = cli ? { import: entry } : { require: entry }
        if (!cli && behavior.requireFailure === 'missing') {
          exported = './missing.cjs'
        }
        if (!cli && behavior.requireFailure === 'invalid') {
          exported = '../outside.cjs'
        }
        if (!cli && behavior.requireFailure === 'import-only') {
          exported = { import: entry }
        }
        const cliBin = kind === 'taro' ? 'bin/taro' : 'bin/cli.mjs'
        const exports = { '.': exported }
        if (cli && kind === 'taro' && behavior.taroBinFailure !== 'hidden') {
          exports['./bin/taro'] = behavior.taroBinFailure === 'missing' ? './bin/missing-taro' : behavior.taroBinFailure === 'mismatch' ? './bin/other-taro' : './bin/taro'
        }
        const bin = behavior.taroBinFailure === 'string-bin' ? `./${cliBin}` : { [definition.binary[1]]: behavior.binPath ?? `./${cliBin}` }
        await write(directory, 'package.json', JSON.stringify({
          name,
          version: '1.0.0-fixture',
          type: cli && kind !== 'taro' ? 'module' : 'commonjs',
          exports,
          ...(cli ? { bin } : {}),
        }))
        await write(directory, entry.slice(2), cli ? 'export const fixture = true\n' : 'module.exports = {}\n')
        if (cli) {
          if (behavior.binFailure === 'borrowed') {
            const external = await write(parent, `${kind}-borrowed.mjs`, 'export const borrowed = true\n')
            await fs.mkdir(path.join(directory, 'bin'), { recursive: true })
            await fs.symlink(external, path.join(directory, ...cliBin.split('/')))
          }
          else if (behavior.binFailure !== 'missing') {
            await write(directory, cliBin, kind === 'taro' ? 'module.exports = { cli: true }\n' : 'export const cli = true\n')
            if (kind === 'taro' && behavior.taroBinFailure === 'mismatch') {
              await write(directory, 'bin/other-taro', 'module.exports = { other: true }\n')
            }
          }
        }
        const link = path.join(project, 'node_modules', ...name.split('/'))
        await fs.mkdir(path.dirname(link), { recursive: true })
        await fs.symlink(directory, link, process.platform === 'win32' ? 'junction' : 'dir')
      }
      await write(project, `node_modules/.bin/${definition.binary[1]}`, '# fixture shim\n')
    }
    else if (args[0] === 'run' && args[1] === 'build:pkgs') {
      if (!behavior.leaveWorkspacePending) {
        await write(request.cwd, 'packages/weapp-tailwindcss/dist/index.cjs', 'module.exports = {}\n')
        await write(request.cwd, 'packages/postcss/dist/index.cjs', 'module.exports = {}\n')
      }
    }
    else if (args[0] !== '--version') {
      throw new Error('夹具收到非固定 pnpm argv')
    }
    const stdout = args[0] === '--version' ? '12.15.0\n' : ''
    await fs.writeFile(request.stdoutFile, stdout, { flag: 'wx' })
    await fs.writeFile(request.stderrFile, '', { flag: 'wx' })
    return { exitCode: 0, signal: null, closeConfirmed: true, cleanupErrors: [], stdout, logs: { stdout: await fileReceipt(request.stdoutFile), stderr: await fileReceipt(request.stderrFile) } }
  }
  return { parent, calls, definition, options: { sourceRepository, driverCommit: current, products: [{ role: 'base', sourceCommit: base }, { role: 'current', sourceCommit: current }], outputDirectory: path.join(parent, 'prepared'), kind, pnpmEntry, execute } }
}
