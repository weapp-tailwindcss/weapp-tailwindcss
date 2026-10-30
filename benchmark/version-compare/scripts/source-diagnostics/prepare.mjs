import fs from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { archiveGitArgs, archiveGitOptions, readArchiveSource } from './archive-attributes.mjs'
import { executeCommand } from './command.mjs'
import { errorRecord, fileReceipt, inside, limits, readBounded, writeJson } from './files.mjs'
import { assertCommit, assertDriverClean, extractArchive, readGitIdentity, snapshotTracked } from './git-source.mjs'
import { collectInputs, kinds, verifyInstalledOwnership } from './inputs.mjs'

function runner(directory, execute, commands) {
  let sequence = 0
  return async (label, executable, args, cwd, options = {}) => {
    const stem = `${String(++sequence).padStart(3, '0')}-${label}`
    if (executable === 'git') {
      args = ['--no-replace-objects', ...args]
    }
    const request = {
      executable,
      args,
      cwd,
      stdoutFile: path.join(directory, `${stem}.stdout.log`),
      stderrFile: path.join(directory, `${stem}.stderr.log`),
      ...options,
    }
    let result
    try {
      result = await execute(request)
    }
    catch (error) {
      commands.push({
        label,
        ...request,
        firstFailure: errorRecord('execute', error),
      })
      throw error
    }
    const {
      stdout,
      ...record
    } = result
    commands.push({
      label,
      ...request,
      ...record,
    })
    if (result.firstFailure || result.exitCode !== 0 || result.closeConfirmed !== true || result.cleanupErrors?.length) {
      throw new Error(`阶段命令失败：${label}：${result.firstFailure?.message ?? result.exitCode}`)
    }
    return result
  }
}
async function toolsFor(sourceRepository, injected) {
  const require = createRequire(import.meta.url)
  const semver = require('semver')
  const tar = require('tar')
  const tools = []
  for (const name of ['tar', 'semver']) {
    const entry = await fs.realpath(require.resolve(name))
    const json = await fs.realpath(require.resolve(`${name}/package.json`))
    if (!injected && (!inside(sourceRepository, entry) || !inside(sourceRepository, json))) {
      throw new Error('driver 工具借用了外部依赖')
    }
    tools.push({
      name,
      version: JSON.parse((await readBounded(json)).toString('utf8')).version,
      entry: await fileReceipt(entry),
      packageJson: await fileReceipt(json),
    })
  }
  const controllerSources = []
  for (const name of ['prepare.mjs', 'command.mjs', 'files.mjs', 'git-source.mjs', 'gitlinks.mjs', 'archive-attributes.mjs', 'source-bytes.mjs', 'inputs.mjs', 'package-inputs.mjs', 'verify.mjs']) {
    controllerSources.push(await fileReceipt(fileURLToPath(new URL(name, import.meta.url))))
  }
  return {
    tar,
    semver,
    receipts: {
      tools,
      controllerSources,
    },
  }
}
async function newOutput(sourceRepository, requested) {
  if (!path.isAbsolute(requested)) {
    throw new Error('outputDirectory 必须为绝对路径')
  }
  const parent = await fs.realpath(path.dirname(requested))
  const output = path.join(parent, path.basename(requested))
  if (inside(sourceRepository, output) || inside(output, sourceRepository)) {
    throw new Error('source/output 不能重叠')
  }
  try {
    await fs.lstat(output)
    throw new Error('outputDirectory 必须不存在')
  }
  catch (error) {
    if (error.code !== 'ENOENT') {
      throw error
    }
  }
  await fs.mkdir(output)
  for (const name of ['evidence', 'products', 'archives']) {
    await fs.mkdir(path.join(output, name))
  }
  return output
}

/** 只准备固定诊断目标；不会执行任意调用方 shell 命令。 */
export async function prepareSourceDiagnostics(options) {
  if (!options || !kinds[options.kind]) {
    throw new Error('kind 必须显式为 watch/taro/runtime')
  }
  assertCommit(options.driverCommit)
  if (!Array.isArray(options.products) || options.products.length !== 2 || options.products[0]?.role !== 'base' || options.products[1]?.role !== 'current') {
    throw new Error('products 必须准确为 base/current 两侧')
  }
  for (const product of options.products) {
    assertCommit(product.sourceCommit)
  }
  const sourceRepository = await fs.realpath(options.sourceRepository)
  const output = await newOutput(sourceRepository, options.outputDirectory)
  let evidenceDirectory = path.join(output, 'evidence')
  if (options.evidenceDirectory) {
    if (!path.isAbsolute(options.evidenceDirectory)) {
      throw new Error('evidenceDirectory 必须为绝对路径')
    }
    const parent = await fs.realpath(path.dirname(options.evidenceDirectory))
    evidenceDirectory = path.join(parent, path.basename(options.evidenceDirectory))
    if (inside(output, evidenceDirectory) || inside(evidenceDirectory, output)) {
      throw new Error('独立 evidence 不能与 products/archives 重叠')
    }
    await fs.mkdir(evidenceDirectory)
  }
  const report = {
    schemaVersion: 1,
    diagnosticOnly: true,
    budgetAcceptance: false,
    status: 'complete',
    kind: options.kind,
    outputDirectory: output,
    evidenceDirectory,
    sourceRepository,
    executionProvider: options.execute ? 'injected' : 'native',
    roles: [],
    commands: [],
    limitations: ['归档/读取要求任务独占静止目录；不声明恶意并发写入下的原子快照', 'native Windows 在拥有明确进程树关闭证据前失败，不作为受测平台'],
  }
  const execute = options.execute ?? executeCommand
  const driverDirectory = path.join(evidenceDirectory, 'driver')
  await fs.mkdir(driverDirectory)
  await fs.mkdir(path.join(evidenceDirectory, 'roles'))
  const driverRun = runner(driverDirectory, execute, report.commands)
  const stage = 'driver'
  try {
    if (!options.execute && process.platform === 'win32') {
      throw new Error('本诊断 native 准备执行器仅支持 Linux/macOS；Windows 需先实现 owned job 后代关闭确认')
    }
    await assertDriverClean(driverRun, sourceRepository, options.driverCommit)
    const identity = await readGitIdentity(driverRun, sourceRepository, options.driverCommit)
    const manifest = await writeJson(path.join(driverDirectory, 'source-tree.json'), identity)
    const {
      tar,
      semver,
      receipts,
    } = await toolsFor(sourceRepository, Boolean(options.execute))
    const pnpmEntry = await fs.realpath(options.pnpmEntry ?? options.pnpmNodeEntry ?? process.env.npm_execpath ?? '')
    if (/\.(?:cmd|bat|ps1)$/i.test(pnpmEntry)) {
      throw new Error('不接受需 shell 重解释的 pnpm 包装脚本')
    }
    const nodeScript = /\.(?:c|m)?js$/i.test(pnpmEntry)
    if (!nodeScript) {
      await fs.access(pnpmEntry, process.platform === 'win32' ? 0 : 1)
    }
    const managerExecutable = nodeScript ? process.execPath : pnpmEntry
    const managerPrefix = nodeScript ? [pnpmEntry] : []
    const packageManager = {
      ...(await fileReceipt(pnpmEntry, {
        kind: 'package-manager',
        maximum: limits.managerBytes,
      })),
      format: nodeScript ? 'node-script' : 'native-executable',
      command: {
        executable: managerExecutable,
        argsPrefix: managerPrefix,
        shell: false,
      },
    }
    const driver = {
      schemaVersion: 1,
      diagnosticOnly: true,
      budgetAcceptance: false,
      status: 'complete',
      sourceRepository,
      driverCommit: identity.sourceCommit,
      driverTree: identity.sourceTree,
      manifest,
      ...receipts,
      packageManager,
      node: {
        version: process.version,
        executable: await fs.realpath(process.execPath),
        nodeOptions: process.env.NODE_OPTIONS ?? '',
      },
      executionProvider: report.executionProvider,
    }
    report.driver = {
      ...driver,
      receipt: await writeJson(path.join(driverDirectory, 'receipt.json'), driver),
    }
    for (const product of options.products) {
      const roleDirectory = path.join(evidenceDirectory, 'roles', product.role)
      await fs.mkdir(roleDirectory)
      const root = path.join(output, 'products', product.role)
      const role = {
        schemaVersion: 1,
        diagnosticOnly: true,
        budgetAcceptance: false,
        status: 'complete',
        role: product.role,
        kind: options.kind,
        root,
        sourceCommit: product.sourceCommit,
        driverCommit: identity.sourceCommit,
        driverTree: identity.sourceTree,
        driverReceipt: report.driver.receipt,
        executionProvider: report.executionProvider,
        commands: [],
        verificationPolicy: {
          before: 'all-tracked-and-immutable-inputs',
          checkpoint: 'immutable-inputs-only',
          after: 'all-tracked-and-immutable-inputs',
          hmrMutationEvidence: 'controller-owned-original-write-restore',
        },
      }
      const run = runner(roleDirectory, execute, role.commands)
      let roleStage = 'source'
      try {
        const canonicalSource = await readGitIdentity(run, sourceRepository, product.sourceCommit)
        const source = await readArchiveSource(run, sourceRepository, canonicalSource)
        role.sourceTree = source.sourceTree
        role.objectFormat = source.objectFormat
        const archive = path.join(output, 'archives', `${product.role}.tar`)
        await run('archive', 'git', archiveGitArgs(['archive', '--format=tar', product.sourceCommit]), sourceRepository, {
          ...archiveGitOptions(product.sourceCommit),
          stdoutFile: archive,
          stdoutLimit: limits.archiveBytes,
          capture: false,
        })
        const extracted = await extractArchive({
          archive,
          root,
          identity: source,
          tar,
          manifestFile: path.join(roleDirectory, 'archive-manifest.json'),
        })
        role.sourceArchive = {
          ...extracted.archiveReceipt,
          manifest: extracted.manifest,
          uploadByDefault: false,
        }
        role.sourceManifest = await writeJson(path.join(roleDirectory, 'source-manifest.json'), {
          schemaVersion: 1,
          role: product.role,
          sourceCommit: source.sourceCommit,
          sourceTree: source.sourceTree,
          objectFormat: source.objectFormat,
          files: extracted.snapshot,
          gitlinks: source.gitlinks,
          exportPolicy: source.exportPolicy,
        })
        role.trackedManifestSha256 = role.sourceManifest.sha256
        const lock = await fileReceipt(path.join(root, 'pnpm-lock.yaml'), {
          root,
          kind: 'lock',
        })
        role.lockSha256 = lock.sha256
        const rootPackage = JSON.parse((await readBounded(path.join(root, 'package.json'))).toString('utf8'))
        const manager = /^pnpm@([^+]+)(?:\+.*)?$/.exec(rootPackage.packageManager ?? '')
        if (!manager || !semver.valid(manager[1]) || !rootPackage.engines?.node || !semver.satisfies(process.versions.node, rootPackage.engines.node)) {
          throw new Error('pnpm 版本必须精确固定，当前 Node 必须满足 product engines')
        }
        role.packageManager = rootPackage.packageManager
        role.node = driver.node
        roleStage = 'pnpm-version'
        const version = await run('pnpm-version', managerExecutable, [...managerPrefix, '--version'], root)
        if (version.stdout.trim() !== manager[1]) {
          throw new Error('实际 pnpm 与 product packageManager 不一致')
        }
        roleStage = 'install'
        await run('install', managerExecutable, [...managerPrefix, 'install', '--frozen-lockfile'], root)
        await snapshotTracked(root, source, extracted.snapshot)
        role.installOwnership = await verifyInstalledOwnership(root, options.kind, { allowBuildPending: true })
        roleStage = 'build'
        await run('build-pkgs', managerExecutable, [...managerPrefix, 'run', 'build:pkgs'], root)
        await snapshotTracked(root, source, extracted.snapshot)
        roleStage = 'inputs'
        role.inputs = await collectInputs(root, options.kind, source.files)
        for (const file of role.inputs.files) {
          file.immutableDuringWorkload = true
        }
        roleStage = 'driver-recheck'
        await assertDriverClean(run, sourceRepository, options.driverCommit)
      }
      catch (error) {
        role.status = 'incomplete'
        role.firstFailure = errorRecord(roleStage, error)
        report.firstFailure ??= {
          role: product.role,
          ...role.firstFailure,
        }
        report.status = 'incomplete'
      }
      role.receipt = await writeJson(path.join(roleDirectory, 'preparation.json'), role)
      role.preparationReceiptSha256 = role.receipt.sha256
      report.roles.push(role)
      if (role.status !== 'complete') {
        break
      }
    }
  }
  catch (error) {
    report.status = 'incomplete'
    report.firstFailure ??= errorRecord(stage, error)
  }
  report.unstartedRoles = options.products.filter(product => !report.roles.some(role => role.role === product.role)).map(product => product.role)
  report.receipt = await writeJson(path.join(evidenceDirectory, 'preparation.json'), report)
  return report
}
export { executeCommand } from './command.mjs'
export { verifyDriverReceipt, verifyPreparedRole } from './verify.mjs'
