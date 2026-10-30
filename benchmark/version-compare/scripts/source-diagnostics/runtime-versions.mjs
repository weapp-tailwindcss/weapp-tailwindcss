import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { bindingFilePath, driverModulePaths, normalizeRuntimeBinding, verifyRuntimeBinding } from '../runtime-diagnostics/binding.mjs'
import { digestBytes, readBoundedFile, sameRuntimePath } from '../runtime-diagnostics/bounded-file.mjs'
import { kinds } from './inputs.mjs'
import { verifyDriverReceipt, verifyPreparedRole } from './verify.mjs'

const sourcePrefix = 'benchmark/version-compare/scripts/source-diagnostics'
const sourceDriverPaths = ['run', 'verify', 'prepare', 'inputs', 'package-inputs', 'files', 'command', 'git-source', 'runtime-versions', 'join-runtime'].map(name => `${sourcePrefix}/${name}.mjs`)
const fullDriverPaths = [...new Set([...driverModulePaths, ...sourceDriverPaths])]
const hmrSource = 'demo/weapp-vite-tailwindcss-v4/pages/index/index.wxml'
const fileLimit = 16 * 1024 * 1024
function inside(root, file) {
  const relative = path.relative(root, file)
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)
}
function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}
const logical = value => value.split(path.sep).join('/')
function inventoryFile(root, receipt) {
  assert(receipt && receipt.immutableDuringWorkload === true && path.isAbsolute(receipt.physical ?? ''), 'runtime 关键文件必须来自 immutable 准备回执')
  const physical = fs.realpathSync(receipt.physical)
  assert(sameRuntimePath(physical, receipt.physical) && inside(root, physical), 'runtime 关键文件物理归属不符')
  const relativePath = logical(path.relative(root, physical))
  assert(sameRuntimePath(bindingFilePath(root, relativePath), physical), 'runtime 关键文件逻辑路径不符')
  readBoundedFile(physical, {
    maximumBytes: fileLimit,
    receipt,
  })
  return {
    relativePath,
    bytes: receipt.bytes,
    sha256: receipt.sha256,
  }
}
function driverInventory(driver) {
  const root = fs.realpathSync(driver.sourceRepository)
  const manifest = JSON.parse(readBoundedFile(driver.manifest.physical, {
    maximumBytes: 32 * 1024 * 1024,
    receipt: driver.manifest,
  }).toString('utf8'))
  assert(manifest.sourceCommit === driver.driverCommit && manifest.sourceTree === driver.driverTree && manifest.objectFormat === 'sha1', 'runtime driver 完整 Git 来源清单不符')
  const sourceFiles = new Map(manifest.files.map(file => [file.logical, file]))
  const files = fullDriverPaths.map((relativePath) => {
    const file = bindingFilePath(root, relativePath)
    assert(sameRuntimePath(fs.realpathSync(file), file), 'runtime driver 源文件不能经过符号链接')
    const source = sourceFiles.get(relativePath)
    assert(source && ['100644', '100755'].includes(source.mode), `runtime driver 源文件未列入准确 Git tree：${relativePath}`)
    const bytes = readBoundedFile(file, {
      maximumBytes: fileLimit,
    })
    const gitBlob = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex')
    assert(gitBlob === source.gitBlob, `runtime driver 实际源码与 Git blob 不符：${relativePath}`)
    return {
      relativePath,
      bytes: bytes.length,
      sha256: digestBytes(bytes),
    }
  })
  return {
    root,
    sourceCommit: driver.driverCommit,
    sourceTree: driver.driverTree,
    files,
  }
}
function productInventory(role) {
  const root = fs.realpathSync(role.root)
  const project = bindingFilePath(root, kinds.runtime.project)
  assert(sameRuntimePath(fs.realpathSync(project), role.inputs.project), 'runtime 准备项目与固定目标不符')
  const mutableFile = fs.realpathSync(bindingFilePath(root, hmrSource))
  assert(inside(root, mutableFile), 'runtime HMR 源越过产品根')
  const byPhysical = new Map(role.inputs.files.map(file => [file.physical, file]))
  const selected = new Map()
  const add = (candidate, required = false) => {
    const file = byPhysical.get(candidate?.physical)
    assert(file && candidate.bytes === file.bytes && candidate.sha256 === file.sha256, 'runtime package/bin 入口不在完整准备 inputs 中')
    if (sameRuntimePath(file.physical, mutableFile)) {
      assert(!required, 'runtime HMR 源不能同时充当不可变入口或 manifest')
      return
    }
    selected.set(file.physical, inventoryFile(root, file))
  }
  const rootManifest = byPhysical.get(path.join(root, 'package.json'))
  const projectManifest = byPhysical.get(path.join(project, 'package.json'))
  const lock = byPhysical.get(path.join(root, 'pnpm-lock.yaml'))
  for (const file of [rootManifest, projectManifest, lock]) {
    add(file, true)
  }
  for (const item of role.inputs.packages) {
    add(item.packageJson, true)
    if (item.entry) {
      add(item.entry, true)
    }
  }
  const binary = role.inputs.binaries.find(item => item.packageName === 'weapp-vite' && item.name === 'weapp-vite')
  assert(binary, 'runtime 缺 weapp-vite 实际业务 bin')
  add(binary.packageJson, true)
  add(binary.entry, true)
  for (const file of role.inputs.files) {
    if (['source', 'config', 'lock', 'package-json'].includes(file.kind)) {
      add(file)
    }
  }
  const files = [...selected.values()]
  const listedLock = files.find(file => file.relativePath === 'pnpm-lock.yaml')
  assert(listedLock?.sha256 === role.lockSha256, 'runtime lock 与准备回执不符')
  return {
    inventory: {
      root,
      sourceCommit: role.sourceCommit,
      sourceTree: role.sourceTree,
      files,
    },
    lock: listedLock,
    binary,
    selected,
    excludedMutableFile: mutableFile,
  }
}

/** 将完整准备报告缩为 runtime 每阶段可复核的关键清单，完整 tree/dist 仍由 prepare before/after 负责。 */
export async function createRuntimeVersions(report, {
  allowInjected = false,
} = {}) {
  assert(report?.status === 'complete' && report.kind === 'runtime' && report.diagnosticOnly === true && report.budgetAcceptance === false, 'runtime versions 只接受完整 runtime 准备报告')
  assert(allowInjected || report.executionProvider === 'native', 'runtime versions 禁止注入 fixture 准备结果')
  assert(Array.isArray(report.roles) && report.roles.length === 2 && report.roles[0].role === 'base' && report.roles[1].role === 'current', 'runtime versions 必须准确 base/current 两侧')
  const driver = await verifyDriverReceipt(report.driver, {
    allowInjected,
  })
  const driverBinding = driverInventory(driver)
  const roots = new Set()
  const versions = []
  for (const input of report.roles) {
    const role = await verifyPreparedRole(input, {
      phase: 'before',
      allowInjected,
    })
    assert(role.kind === 'runtime' && role.driverCommit === driver.driverCommit && role.driverTree === driver.driverTree && role.driverReceipt.sha256 === report.driver.receipt.sha256, 'runtime role 与准备 driver 凭证不符')
    const product = productInventory(role)
    assert(!roots.has(product.inventory.root) && !inside(driverBinding.root, product.inventory.root) && !inside(product.inventory.root, driverBinding.root), 'runtime roots 重复或与 driver 重叠')
    for (const root of roots) {
      assert(!inside(root, product.inventory.root) && !inside(product.inventory.root, root), 'runtime 两侧产品根不能嵌套')
    }
    roots.add(product.inventory.root)
    const binding = normalizeRuntimeBinding({
      schemaVersion: 1,
      product: product.inventory,
      lock: product.lock,
      driver: driverBinding,
    })
    verifyRuntimeBinding(binding, {
      root: role.root,
      sourceCommit: role.sourceCommit,
      sourceTree: role.sourceTree,
      expectedEntry: product.binary.entry.physical,
      manifestPath: product.binary.packageJson.physical,
      ...(allowInjected
        ? {}
        : {
            driverModule: {
              relativePath: `${sourcePrefix}/runtime-versions.mjs`,
              file: fileURLToPath(import.meta.url),
            },
          }),
    })
    versions.push({
      version: role.role,
      root: role.root,
      diagnosticIdentity: {
        role: role.role,
        sourceCommit: role.sourceCommit,
        sourceTree: role.sourceTree,
        sourceWorkingTreeStatus: '',
        sourceWorkingTreeStatusScope: 'prepared archive 无 .git；准确来源由准备凭证证明，此字段不表示产品 Git status',
        lockSha256: role.lockSha256,
        driverCommit: driver.driverCommit,
        driverTree: driver.driverTree,
        preparationReceiptSha256: role.preparationReceiptSha256,
        trackedManifestSha256: role.trackedManifestSha256,
        binding,
        bindingScope: {
          product: '仅不可变入口/bin/manifest/package entries/source/config/lock；不含完整 dist、命令 shims 或 package manager',
          fullTreeAndDist: 'prepare before/after 全量清单验证；本 binding 不声称每 checkpoint 证明完整源码或传递 dist',
          excludedHmrSources: [hmrSource],
          hmrProof: 'controller initial/write/rollback/final source 证据，恢复后 prepare after 全量复核',
          preparationReceipt: role.receipt,
          sourceManifest: role.sourceManifest,
          archiveManifest: role.sourceArchive.manifest,
          omittedDistFiles: role.inputs.files.filter(file => file.kind === 'dist' && !product.selected.has(file.physical)).length,
          driver: 'driverModulePaths + source-diagnostics orchestrator/prepare/verify/binding helpers；实际字节同时匹配 driver Git blob',
        },
      },
    })
  }
  assert(Buffer.byteLength(JSON.stringify(versions)) < 2 * 1024 * 1024, 'runtime expected versions 超过控制输入固定上限')
  return versions
}
