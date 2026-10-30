import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { fileReceipt, inside, limits, readBounded, sha256 } from './files.mjs'
import { assertCommit, readGitIdentity, snapshotTracked } from './git-source.mjs'
import { collectInputs, kinds, verifyInstalledOwnership } from './inputs.mjs'

const exec = promisify(execFile)
async function verifyFile(receipt, maximum = limits.fileBytes) {
  if (!receipt || !path.isAbsolute(receipt.physical ?? '') || !/^[a-f0-9]{64}$/.test(receipt.sha256 ?? '') || !Number.isSafeInteger(receipt.bytes)) {
    throw new Error('文件回执协议不完整')
  }
  const actual = await fileReceipt(receipt.physical, {
    maximum,
  })
  if (actual.physical !== receipt.physical || actual.bytes !== receipt.bytes || actual.sha256 !== receipt.sha256) {
    throw new Error(`回执文件身份变化：${receipt.physical}`)
  }
  return actual
}
async function readJsonReceipt(receipt) {
  if (!receipt || !path.isAbsolute(receipt.physical ?? '') || !/^[a-f0-9]{64}$/.test(receipt.sha256 ?? '')) {
    throw new Error('JSON 回执协议不完整')
  }
  if ((await fs.realpath(receipt.physical)) !== receipt.physical) {
    throw new Error('JSON 回执物理路径变化')
  }
  const bytes = await readBounded(receipt.physical, limits.manifestBytes)
  if (bytes.length !== receipt.bytes || sha256(bytes) !== receipt.sha256) {
    throw new Error('JSON 回执字节身份变化')
  }
  return JSON.parse(bytes.toString('utf8'))
}

/** 验证独立 driver 凭证；checkpoint 可复用准备时 Git 身份，但仍核对工具/helper 文件。 */
export async function verifyDriverReceipt(input, {
  allowInjected = false,
  checkGit = true,
  verifyToolchain = checkGit,
  expectedCommit,
  expectedTree,
} = {}) {
  const descriptor = input.driverReceipt ?? input.receipt ?? input
  const driver = await readJsonReceipt(descriptor)
  if (driver.schemaVersion !== 1 || driver.status !== 'complete' || driver.diagnosticOnly !== true || driver.budgetAcceptance !== false || (!allowInjected && driver.executionProvider !== 'native')) {
    throw new Error('driver 准备凭证不完整或为注入 fixture')
  }
  assertCommit(driver.driverCommit)
  assertCommit(driver.driverTree)
  if ((expectedCommit && expectedCommit !== driver.driverCommit) || (expectedTree && expectedTree !== driver.driverTree)) {
    throw new Error('driver 凭证与 role 身份不一致')
  }
  const repository = await fs.realpath(driver.sourceRepository)
  if (repository !== driver.sourceRepository) {
    throw new Error('driver 根发生物理变化')
  }
  const manifest = await readJsonReceipt(driver.manifest)
  if (manifest.sourceCommit !== driver.driverCommit || manifest.sourceTree !== driver.driverTree) {
    throw new Error('driver 完整清单身份不一致')
  }
  if (checkGit) {
    const git = async args => (await exec('git', ['--no-replace-objects', ...args], {
      cwd: repository,
      shell: false,
      windowsHide: true,
      encoding: 'utf8',
      timeout: 10000,
      maxBuffer: limits.manifestBytes,
    })).stdout
    const head = (await git(['rev-parse', 'HEAD'])).trim()
    const status = await git(['status', '--porcelain=v1', '--untracked-files=all'])
    if (head !== driver.driverCommit || status !== '') {
      throw new Error('driver 不再是准确干净 HEAD')
    }
    const actual = await readGitIdentity(async (_label, _command, args) => ({
      stdout: await git(args),
    }), repository, driver.driverCommit)
    if (JSON.stringify(actual) !== JSON.stringify(manifest)) {
      throw new Error('driver 清单不等于准确 Git tree')
    }
  }
  if (!Array.isArray(driver.controllerSources) || !driver.controllerSources.length || !Array.isArray(driver.tools) || driver.tools.length !== 2) {
    throw new Error('driver 缺 helper/toolchain 身份')
  }
  for (const file of driver.controllerSources) {
    await verifyFile(file)
  }
  if (verifyToolchain) {
    for (const tool of driver.tools) {
      await verifyFile(tool.entry)
      await verifyFile(tool.packageJson)
    }
    await verifyFile(driver.packageManager, limits.managerBytes)
  }
  return driver
}

/** before/after 校验全部 tracked 源；checkpoint 仅校验不可变关键输入，HMR 原文/回滚由 controller 拥有。 */
export async function verifyPreparedRole(input, {
  phase = 'before',
  allowInjected = false,
  checkDriverGit = phase !== 'checkpoint',
} = {}) {
  if (!['before', 'checkpoint', 'after'].includes(phase)) {
    throw new Error('未知准备凭证校验阶段')
  }
  const descriptor = input.receipt
  if (input.preparationReceiptSha256 !== descriptor?.sha256) {
    throw new Error('preparedRole 缺准确 preparation receipt SHA')
  }
  const role = await readJsonReceipt(descriptor)
  if (role.schemaVersion !== 1 || role.status !== 'complete' || role.diagnosticOnly !== true || role.budgetAcceptance !== false || !kinds[role.kind] || !['base', 'current'].includes(role.role) || (!allowInjected && role.executionProvider !== 'native')) {
    throw new Error('role 准备凭证未完成或为注入 fixture')
  }
  for (const key of ['role', 'kind', 'root', 'sourceCommit', 'sourceTree', 'lockSha256', 'trackedManifestSha256', 'driverCommit', 'driverTree']) {
    if (input[key] !== role[key]) {
      throw new Error(`preparedRole 外层身份与回执不符：${key}`)
    }
  }
  assertCommit(role.sourceCommit)
  assertCommit(role.sourceTree)
  const root = await fs.realpath(role.root)
  if (root !== role.root) {
    throw new Error('prepared root 物理归属变化')
  }
  try {
    await fs.lstat(path.join(root, '.git'))
    throw new Error('产品根不能含 .git')
  }
  catch (error) {
    if (error.code !== 'ENOENT') {
      throw error
    }
  }
  const driver = await verifyDriverReceipt(role.driverReceipt, {
    allowInjected,
    checkGit: checkDriverGit,
    expectedCommit: role.driverCommit,
    expectedTree: role.driverTree,
  })
  if (inside(driver.sourceRepository, root) || inside(root, driver.sourceRepository)) {
    throw new Error('driver/product 根重叠')
  }
  const source = await readJsonReceipt(role.sourceManifest)
  if (role.trackedManifestSha256 !== role.sourceManifest.sha256 || source.role !== role.role || source.sourceCommit !== role.sourceCommit || source.sourceTree !== role.sourceTree || source.objectFormat !== 'sha1' || !Array.isArray(source.files) || !source.files.length || !Array.isArray(source.gitlinks) || source.exportPolicy?.version !== 1 || source.exportPolicy.sourceCommit !== role.sourceCommit || source.exportPolicy.sourceTree !== role.sourceTree) {
    throw new Error('source manifest 与 role 身份不一致')
  }
  const archive = await readJsonReceipt(role.sourceArchive.manifest)
  if (archive.sourceCommit !== role.sourceCommit || archive.sourceTree !== role.sourceTree || !Array.isArray(archive.entries) || JSON.stringify(archive.gitlinks) !== JSON.stringify(source.gitlinks) || JSON.stringify(archive.exportPolicy) !== JSON.stringify(source.exportPolicy)) {
    throw new Error('archive manifest 与 role 身份不一致')
  }
  if (phase !== 'checkpoint') {
    await verifyFile(role.sourceArchive, limits.archiveBytes)
    await snapshotTracked(root, {
      ...source,
      files: source.files,
    }, source.files)
  }
  if (!role.inputs?.files?.length || role.inputs.files.some(file => file.immutableDuringWorkload !== true)) {
    throw new Error('关键输入必须明确为 immutable')
  }
  for (const file of role.inputs.files) {
    if (!inside(root, file.physical)) {
      throw new Error('关键输入物理归属越界')
    }
    await verifyFile(file)
  }
  const lock = await fileReceipt(path.join(root, 'pnpm-lock.yaml'), {
    root,
  })
  if (lock.sha256 !== role.lockSha256) {
    throw new Error('lock 与准备凭证不一致')
  }
  await verifyInstalledOwnership(root, role.kind)
  const actual = await collectInputs(root, role.kind, source.files)
  for (const file of actual.files) {
    file.immutableDuringWorkload = true
  }
  if (JSON.stringify(actual) !== JSON.stringify(role.inputs)) {
    throw new Error('关键输入集合、dist 内容或实际 package/bin 身份变化')
  }
  return {
    ...role,
    receipt: descriptor,
    preparationReceiptSha256: descriptor.sha256,
    verifiedPhase: phase,
    trackedSourcesVerified: phase !== 'checkpoint',
  }
}
