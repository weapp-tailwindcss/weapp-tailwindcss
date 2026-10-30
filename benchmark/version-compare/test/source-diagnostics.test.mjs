import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { promisify } from 'node:util'
import * as tar from 'tar'
import { afterEach, expect, it } from 'vitest'
import { fileReceipt, logical, readBounded } from '../scripts/source-diagnostics/files.mjs'
import { extractArchive, readGitIdentity } from '../scripts/source-diagnostics/git-source.mjs'
import { kinds } from '../scripts/source-diagnostics/inputs.mjs'
import { executeCommand, prepareSourceDiagnostics, verifyDriverReceipt, verifyPreparedRole } from '../scripts/source-diagnostics/prepare.mjs'

const exec = promisify(execFile)
const temporary = []
afterEach(async () => {
  for (const directory of temporary.splice(0)) {
    await fs.rm(directory, {
      recursive: true,
      force: true,
    })
  }
})
async function git(cwd, args) {
  return (await exec('git', args, {
    cwd,
    shell: false,
    encoding: 'utf8',
  })).stdout.trim()
}
async function write(root, logical, source) {
  const file = path.join(root, ...logical.split('/'))
  await fs.mkdir(path.dirname(file), {
    recursive: true,
  })
  await fs.writeFile(file, source)
  return file
}
async function fixture(behavior = {}) {
  const parent = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'source-preparation-fixture-')))
  temporary.push(parent)
  const sourceRepository = path.join(parent, 'source')
  await fs.mkdir(sourceRepository)
  await git(sourceRepository, ['init'])
  await write(sourceRepository, '.gitignore', 'node_modules/\n')
  await write(sourceRepository, 'package.json', JSON.stringify({
    name: 'fixture-root',
    private: true,
    type: 'module',
    packageManager: 'pnpm@12.15.0',
    engines: {
      node: '>=22',
    },
    scripts: {
      'build:pkgs': 'node do-not-run.cjs',
    },
  }))
  await write(sourceRepository, 'pnpm-lock.yaml', 'lockfileVersion: 9.0\n')
  await write(sourceRepository, 'pnpm-workspace.yaml', 'packages: []\n')
  for (const source of kinds.watch.sources) {
    await write(sourceRepository, source, source.endsWith('.css') ? '.fixture{color:red}\n' : 'export const fixture = true\n')
  }
  for (const [directory, name] of [['packages/weapp-tailwindcss', 'weapp-tailwindcss'], ['packages/postcss', '@weapp-tailwindcss/postcss']]) {
    await write(sourceRepository, `${directory}/package.json`, JSON.stringify({
      name,
      version: '1.0.0-fixture',
      main: './dist/index.cjs',
      exports: name === 'weapp-tailwindcss'
        ? {
            '.': './dist/index.cjs',
            './vite': './dist/vite.cjs',
          }
        : {
            '.': './dist/index.cjs',
          },
    }))
  }
  await write(sourceRepository, 'source-note.txt', 'base\n')
  const commit = async (message) => {
    await git(sourceRepository, ['add', '-A'])
    if (behavior.gitlinks) {
      for (const [name, target] of [['tailwindcss-v3', 'a'.repeat(40)], ['tailwindcss-v4', 'b'.repeat(40)]]) {
        await fs.mkdir(path.join(sourceRepository, 'submodules', name), { recursive: true })
        await git(sourceRepository, ['update-index', '--add', '--cacheinfo', `160000,${target},submodules/${name}`])
      }
    }
    await git(sourceRepository, ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', message])
    return git(sourceRepository, ['rev-parse', 'HEAD'])
  }
  const base = await commit('fixture base')
  await write(sourceRepository, 'source-note.txt', 'current\n')
  const current = await commit('fixture current')
  const pnpmNodeEntry = await write(parent, behavior.nativeManager ? 'pnpm-native' : 'pnpm.cjs', '// 模拟 manager 入口，不执行此文件。\n')
  if (behavior.nativeManager) {
    await fs.truncate(pnpmNodeEntry, 17 * 1024 * 1024)
    await fs.chmod(pnpmNodeEntry, 0o755)
  }
  const calls = []
  const execute = async (request) => {
    const isManager = behavior.nativeManager ? request.executable === pnpmNodeEntry : request.executable === process.execPath && request.args[0] === pnpmNodeEntry
    if (!isManager) {
      return executeCommand(request)
    }
    const args = behavior.nativeManager ? request.args : request.args.slice(1)
    calls.push({
      root: request.cwd,
      args,
    })
    let stdout = ''
    let exitCode = 0
    if (args[0] === '--version') {
      stdout = '12.15.0\n'
    }
    else if (args[0] === 'install') {
      for (const directory of ['node_modules/.pnpm', 'node_modules/.bin', 'node_modules/@weapp-tailwindcss']) {
        await fs.mkdir(path.join(request.cwd, ...directory.split('/')), {
          recursive: true,
        })
      }
      for (const [name, target] of [['weapp-tailwindcss', 'packages/weapp-tailwindcss'], ['@weapp-tailwindcss/postcss', 'packages/postcss']]) {
        await fs.symlink(path.join(request.cwd, ...target.split('/')), path.join(request.cwd, 'node_modules', ...name.split('/')), process.platform === 'win32' ? 'junction' : 'dir')
      }
      const vite = path.join(request.cwd, 'node_modules', '.pnpm', 'vite-fixture', 'node_modules', 'vite')
      await write(vite, 'package.json', JSON.stringify({
        name: 'vite',
        version: '0.0.0-fixture',
        main: 'index.cjs',
      }))
      await write(vite, 'index.cjs', 'module.exports = {}\n')
      await fs.symlink(vite, path.join(request.cwd, 'node_modules', 'vite'), process.platform === 'win32' ? 'junction' : 'dir')
      await write(request.cwd, 'node_modules/.bin/vite', '# fixture shim\n')
      if (behavior.borrowCurrent && path.basename(request.cwd) === 'current') {
        await fs.rm(path.join(request.cwd, 'node_modules'), {
          recursive: true,
        })
        await fs.symlink(path.join(path.dirname(request.cwd), 'base', 'node_modules'), path.join(request.cwd, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir')
      }
      if (behavior.installExit) {
        exitCode = 23
        stdout = 'FIRST INSTALL FAILURE\n'
      }
    }
    else if (args[0] === 'run' && args[1] === 'build:pkgs') {
      await write(request.cwd, 'packages/weapp-tailwindcss/dist/index.cjs', 'module.exports = {}\n')
      await write(request.cwd, 'packages/weapp-tailwindcss/dist/vite.cjs', 'module.exports = {}\n')
      await write(request.cwd, 'packages/postcss/dist/index.cjs', 'module.exports = {}\n')
      if (behavior.modifyTracked) {
        await write(request.cwd, 'source-note.txt', 'unexpected build write\n')
      }
    }
    else {
      throw new Error('fixture 收到非固定 pnpm argv')
    }
    await fs.writeFile(request.stdoutFile, stdout, {
      flag: 'wx',
    })
    await fs.writeFile(request.stderrFile, '', {
      flag: 'wx',
    })
    return {
      exitCode,
      signal: null,
      closeConfirmed: true,
      cleanupErrors: [],
      stdout,
      logs: {
        stdout: await fileReceipt(request.stdoutFile),
        stderr: await fileReceipt(request.stderrFile),
      },
    }
  }
  return {
    parent,
    calls,
    options: {
      sourceRepository,
      driverCommit: current,
      products: [{
        role: 'base',
        sourceCommit: base,
      }, {
        role: 'current',
        sourceCommit: current,
      }],
      outputDirectory: path.join(parent, 'prepared'),
      kind: 'watch',
      pnpmNodeEntry,
      execute,
    },
  }
}
it.skipIf(process.platform === 'win32')('真实 Git archive 两个准确 tree，独立模拟 frozen install/build 并留下完整可复核来源', async () => {
  const {
    options,
    calls,
  } = await fixture()
  const report = await prepareSourceDiagnostics(options)
  expect(report).toMatchObject({
    status: 'complete',
    diagnosticOnly: true,
    budgetAcceptance: false,
    executionProvider: 'injected',
    unstartedRoles: [],
  })
  expect(report.roles).toHaveLength(2)
  expect(report.evidenceDirectory).toBe(path.join(options.outputDirectory, 'evidence'))
  for (const role of report.roles) {
    expect(role.root).toBe(path.join(options.outputDirectory, 'products', role.role))
    await expect(fs.lstat(path.join(role.root, '.git'))).rejects.toMatchObject({
      code: 'ENOENT',
    })
    const verified = await verifyPreparedRole(role, {
      allowInjected: true,
    })
    expect(verified).toMatchObject({
      verifiedPhase: 'before',
      trackedSourcesVerified: true,
    })
    expect(role.inputs.files.filter(file => file.kind === 'dist').length).toBeGreaterThanOrEqual(3)
    expect(role.inputs.packages.map(pkg => pkg.name)).toEqual(['weapp-tailwindcss', '@weapp-tailwindcss/postcss', 'vite'])
    expect(calls.filter(call => call.root === role.root).map(call => call.args)).toEqual([['--version'], ['install', '--frozen-lockfile'], ['run', 'build:pkgs']])
    const source = JSON.parse(await fs.readFile(role.sourceManifest.physical, 'utf8'))
    expect(source).toMatchObject({
      sourceCommit: role.sourceCommit,
      sourceTree: role.sourceTree,
    })
    expect(source.files.every(file => file.logical && file.sha256 && file.gitBlob)).toBe(true)
  }
  await expect(verifyPreparedRole(report.roles[0])).rejects.toThrow('注入 fixture')
  await expect(verifyDriverReceipt(report.driver)).rejects.toThrow('注入 fixture')
}, 30000)
it.skipIf(process.platform === 'win32')('native pnpm 入口使用 shell:false 直接 argv，独立流式工具回执', async () => {
  const {
    options,
  } = await fixture({
    nativeManager: true,
  })
  const report = await prepareSourceDiagnostics(options)
  expect(report.status).toBe('complete')
  expect(report.driver.packageManager.bytes).toBeGreaterThan(16 * 1024 * 1024)
  expect(report.driver.packageManager).toMatchObject({
    physical: options.pnpmNodeEntry,
    format: 'native-executable',
    command: {
      executable: options.pnpmNodeEntry,
      argsPrefix: [],
      shell: false,
    },
  })
  expect(report.roles[0].commands.find(command => command.label === 'install')).toMatchObject({
    executable: options.pnpmNodeEntry,
    args: ['install', '--frozen-lockfile'],
  })
}, 30000)
it.skipIf(process.platform === 'win32').each(['installExit', 'modifyTracked', 'borrowCurrent'])('准备失败 %s 保存阶段 index、原始日志和首错，停止未开始工作', async (failure) => {
  const {
    options,
    calls,
  } = await fixture({
    [failure]: true,
  })
  const report = await prepareSourceDiagnostics(options)
  expect(report.status).toBe('incomplete')
  expect(report.firstFailure.role).toBe(failure === 'borrowCurrent' ? 'current' : 'base')
  if (failure === 'installExit') {
    expect(report.firstFailure).toMatchObject({
      stage: 'install',
      message: expect.stringContaining('23'),
    })
  }
  if (failure === 'modifyTracked') {
    expect(report.firstFailure).toMatchObject({
      stage: 'build',
      message: expect.stringContaining('tracked'),
    })
  }
  if (failure === 'borrowCurrent') {
    expect(report.firstFailure).toMatchObject({
      stage: 'install',
      message: expect.stringContaining('归属'),
    })
  }
  const saved = JSON.parse(await fs.readFile(report.receipt.physical, 'utf8'))
  expect(saved.firstFailure).toEqual(report.firstFailure)
  expect(saved.status).toBe('incomplete')
  const failed = report.roles.find(role => role.status === 'incomplete')
  expect(failed.commands.some(command => command.logs?.stdout?.physical)).toBe(true)
  expect(calls.some(call => path.basename(call.root) === failed.role && call.args[1] === 'build:pkgs')).toBe(failure === 'modifyTracked')
}, 30000)
it.skipIf(process.platform === 'win32')('checkpoint 不把 HMR tracked source 暂时修改当成 immutable 失败，恢复后全量校验', async () => {
  const {
    options,
  } = await fixture()
  const report = await prepareSourceDiagnostics(options)
  const role = report.roles[0]
  await write(role.root, 'source-note.txt', 'temporary mutation\n')
  await expect(verifyPreparedRole(role, {
    phase: 'checkpoint',
    allowInjected: true,
  })).resolves.toMatchObject({
    trackedSourcesVerified: false,
  })
  await expect(verifyPreparedRole(role, {
    phase: 'after',
    allowInjected: true,
  })).rejects.toThrow('tracked')
  await write(role.root, 'source-note.txt', 'base\n')
  await expect(verifyPreparedRole(role, {
    phase: 'after',
    allowInjected: true,
  })).resolves.toMatchObject({
    trackedSourcesVerified: true,
  })
  const input = role.inputs.files.find(file => file.kind === 'dist')
  await fs.appendFile(input.physical, '// tampered\n')
  await expect(verifyPreparedRole(role, {
    phase: 'checkpoint',
    allowInjected: true,
  })).rejects.toThrow('身份变化')
}, 30000)
it.skipIf(process.platform === 'win32')('driver 必须是准确干净 HEAD，失败也保留可上传 index', async () => {
  const {
    options,
    calls,
  } = await fixture()
  await write(options.sourceRepository, 'source-note.txt', 'dirty\n')
  const report = await prepareSourceDiagnostics(options)
  expect(report).toMatchObject({
    status: 'incomplete',
    unstartedRoles: ['base', 'current'],
    firstFailure: {
      stage: 'driver',
    },
  })
  expect(calls).toEqual([])
  expect(JSON.parse(await fs.readFile(report.receipt.physical, 'utf8')).status).toBe('incomplete')
})
it.each(['../escape', 'dir/C:escape', 'dir/file:ads', 'CON', 'dir/trailing.', 'dir/trailing ', '.', 'dir\\escape'])('逻辑路径拒绝不可跨平台边界 %s', (file) => {
  expect(() => logical(file)).toThrow()
})
it('descriptor 限额明确失败，不读取完整超限文件', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'source-bounded-'))
  temporary.push(root)
  const file = await write(root, 'large.txt', '12345')
  await expect(readBounded(file, 4)).rejects.toThrow('超限')
})
it.skipIf(process.platform === 'win32')('Git replacement refs 不得改变准确 base commit 的实际 tree', async () => {
  const {
    options,
  } = await fixture()
  await git(options.sourceRepository, ['replace', options.products[0].sourceCommit, options.products[1].sourceCommit])
  const report = await prepareSourceDiagnostics(options)
  expect(report.status).toBe('complete')
  expect(await fs.readFile(path.join(report.roles[0].root, 'source-note.txt'), 'utf8')).toBe('base\n')
  await expect(verifyPreparedRole(report.roles[0], {
    allowInjected: true,
  })).resolves.toMatchObject({
    trackedSourcesVerified: true,
  })
}, 30000)
it.skipIf(process.platform === 'win32')('tar 列举之后替换 archive 必须在解包前失败', async () => {
  const {
    options,
    parent,
  } = await fixture()
  const commit = options.products[0].sourceCommit
  const identity = await readGitIdentity(async (_label, _command, args, cwd) => ({
    stdout: (await exec('git', ['--no-replace-objects', ...args], {
      cwd,
      shell: false,
      encoding: 'utf8',
    })).stdout,
  }), options.sourceRepository, commit)
  const archive = path.join(parent, 'archive.tar')
  const bytes = (await exec('git', ['--no-replace-objects', 'archive', '--format=tar', commit], {
    cwd: options.sourceRepository,
    shell: false,
    encoding: 'buffer',
  })).stdout
  await fs.writeFile(archive, bytes)
  let extracted = false
  const modifiedTar = {
    async t(request) {
      await tar.t(request)
      await fs.appendFile(archive, 'changed archive')
    },
    async x(request) {
      extracted = true
      return tar.x(request)
    },
  }
  await expect(extractArchive({
    archive,
    root: path.join(parent, 'product'),
    identity,
    tar: modifiedTar,
    manifestFile: path.join(parent, 'archive.json'),
  })).rejects.toThrow('归档在列举/解包之间变化')
  expect(extracted).toBe(false)
})

it.skipIf(process.platform === 'win32')('准备失败的原始日志直接位于上传目录，产品与 node_modules 留在外部', async () => {
  const { options, parent } = await fixture({ installExit: true })
  const upload = path.join(parent, 'upload')
  await fs.mkdir(upload)
  const evidenceDirectory = path.join(upload, 'preparation')
  const report = await prepareSourceDiagnostics({ ...options, evidenceDirectory })
  expect(report.status).toBe('incomplete')
  expect(report.evidenceDirectory).toBe(evidenceDirectory)
  expect(report.receipt.physical.startsWith(evidenceDirectory + path.sep)).toBe(true)
  const failedInstall = report.roles[0].commands.find(command => command.label === 'install')
  expect(failedInstall.logs.stdout.physical.startsWith(evidenceDirectory + path.sep)).toBe(true)
  expect(await fs.readFile(failedInstall.logs.stdout.physical, 'utf8')).toContain('FIRST INSTALL FAILURE')
  expect(report.roles[0].root.startsWith(options.outputDirectory + path.sep)).toBe(true)
  await expect(fs.lstat(path.join(evidenceDirectory, 'products'))).rejects.toMatchObject({ code: 'ENOENT' })
}, 30000)

it.skipIf(process.platform === 'win32')('真实 Git gitlink 保留准确引用与空目录，before/after 拒绝初始化的内容', async () => {
  const { options } = await fixture({ gitlinks: true })
  const report = await prepareSourceDiagnostics(options)
  expect(report.status).toBe('complete')
  const expected = [
    { logical: 'submodules/tailwindcss-v3', mode: '160000', gitCommit: 'a'.repeat(40) },
    { logical: 'submodules/tailwindcss-v4', mode: '160000', gitCommit: 'b'.repeat(40) },
  ]
  const driver = JSON.parse(await fs.readFile(report.driver.manifest.physical, 'utf8'))
  expect(driver.gitlinks).toEqual(expected)
  for (const role of report.roles) {
    const source = JSON.parse(await fs.readFile(role.sourceManifest.physical, 'utf8'))
    const archive = JSON.parse(await fs.readFile(role.sourceArchive.manifest.physical, 'utf8'))
    expect(source.gitlinks).toEqual(expected)
    expect(archive.gitlinks).toEqual(expected)
    expect(source.files.every(file => file.mode !== '160000' && file.gitBlob && file.sha256)).toBe(true)
    for (const entry of expected) {
      expect(archive.entries.filter(item => item.logical === entry.logical)).toEqual([
        expect.objectContaining({ type: 'Directory', bytes: 0 }),
      ])
      expect(await fs.readdir(path.join(role.root, ...entry.logical.split('/')))).toEqual([])
    }
    await expect(verifyPreparedRole(role, { phase: 'after', allowInjected: true })).resolves.toMatchObject({ trackedSourcesVerified: true })
  }
  const role = report.roles[0]
  await write(role.root, 'submodules/tailwindcss-v3/unexpected.txt', 'not exported by the parent repository\n')
  await expect(verifyPreparedRole(role, { phase: 'after', allowInjected: true })).rejects.toThrow('gitlink')
}, 30000)
