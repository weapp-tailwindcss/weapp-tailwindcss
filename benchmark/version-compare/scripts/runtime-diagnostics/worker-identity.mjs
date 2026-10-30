import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { assertBoundWorkerModule, sameRuntimeBindingReceipt, verifyRuntimeBinding } from './binding.mjs'
import { readBoundedFile, sameRuntimePath } from './bounded-file.mjs'
import { isWithin } from './module-observer.mjs'
import { sha256 } from './worker-evidence.mjs'

/** 真正业务入口开始观测前核对产品、driver 与复制的 helper。 */
export function verifyRuntimeWorkerIdentity({ identity, root, actualEntry, moduleHashes, helperFiles, preloadUrl }) {
  if (!sameRuntimePath(actualEntry, fs.realpathSync(identity.expectedEntry)) || !isWithin(root, actualEntry)) {
    throw new Error('运行时诊断业务入口身份或准备根不匹配')
  }
  if (fs.existsSync(path.join(root, '.git'))) {
    throw new Error('运行时诊断只接受无 Git 元数据的准备副本')
  }
  const manifestPath = fs.realpathSync(identity.manifestPath)
  if (!isWithin(root, manifestPath)) {
    throw new Error('运行时诊断 manifest 越过准备根')
  }
  const bindingReceipt = verifyRuntimeBinding(identity.binding, {
    root,
    sourceCommit: identity.sourceCommit,
    expectedEntry: actualEntry,
    manifestPath,
    driverModule: identity.driverModule,
  })
  if (!sameRuntimeBindingReceipt(bindingReceipt, identity.bindingReceipt)) {
    throw new Error('运行时诊断 product/lock/driver 回执不匹配')
  }
  const manifestBytes = readBoundedFile(manifestPath, {
    maximumBytes: 256 * 1024,
  })
  const manifest = JSON.parse(manifestBytes)
  const manifestSha256 = sha256(manifestBytes)
  const entrySha256 = sha256(readBoundedFile(actualEntry, {
    maximumBytes: 16 * 1024 * 1024,
  }))
  const bin = typeof manifest.bin === 'string' ? manifest.bin : manifest.bin?.['weapp-vite']
  if (typeof bin !== 'string' || !sameRuntimePath(actualEntry, fs.realpathSync(path.resolve(path.dirname(manifestPath), bin)))) {
    throw new Error('运行时诊断入口不是 manifest 声明的 weapp-vite bin')
  }
  if (manifest.name !== 'weapp-vite' || manifestSha256 !== identity.manifestSha256 || entrySha256 !== identity.expectedEntrySha256) {
    throw new Error('运行时诊断入口或 package manifest 哈希不匹配')
  }
  for (const file of helperFiles) {
    const bytes = readBoundedFile(fileURLToPath(new URL(file, preloadUrl)), {
      maximumBytes: 1024 * 1024,
    })
    assertBoundWorkerModule(identity.binding, file, bytes)
    moduleHashes[file] = sha256(bytes)
    if (identity.moduleHashes?.[file] !== moduleHashes[file]) {
      throw new Error(`运行时诊断 helper 哈希不匹配：${file}`)
    }
  }
  if (Object.keys(identity.moduleHashes ?? {}).length !== helperFiles.length) {
    throw new Error('运行时诊断 helper 清单不匹配')
  }
  return { bindingReceipt, manifestSha256, entrySha256 }
}
