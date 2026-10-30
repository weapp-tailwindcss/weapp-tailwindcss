import { Buffer } from 'node:buffer'
import path from 'node:path'
import process from 'node:process'
import { digestBytes, readBoundedFile, sameRuntimePath } from './bounded-file.mjs'

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}
const sha = value => typeof value === 'string' && /^[a-f\d]{40}$/i.test(value)
const fileLimit = 16 * 1024 * 1024
const manifestLimit = 64 * 1024
const maximumBindingBytes = 96 * 1024 * 1024
export const workerModuleNames = Object.freeze(['preload.mjs', 'worker-evidence.mjs', 'module-observer.mjs', 'inspector-observer.mjs', 'bounded-file.mjs', 'binding.mjs', 'worker-identity.mjs'])
const runtimeModulePaths = [...workerModuleNames, 'controller.mjs', 'controller-report.mjs', 'verify.mjs', 'request.mjs', 'acceptance.mjs'].map(name => `benchmark/version-compare/scripts/runtime-diagnostics/${name}`)
export const driverModulePaths = Object.freeze([...runtimeModulePaths, ...['run-matrix.mjs', 'process-memory.mjs', 'gc-paths.mjs', 'diagnostics/constants.mjs', 'diagnostics/failures.mjs'].map(name => `benchmark/version-compare/scripts/${name}`)])

/** relativePath 是清单中的 POSIX 逻辑路径，仅在这一边界转为本机文件路径。 */
export function bindingFilePath(root, relativePath) {
  assert(typeof root === 'string' && path.isAbsolute(root) && typeof relativePath === 'string' && relativePath.length > 0 && !relativePath.includes('\\') && !relativePath.includes('\0') && !relativePath.includes(':') && !path.posix.isAbsolute(relativePath), '运行时诊断绑定路径无效')
  const segments = relativePath.split('/')
  assert(segments.every(segment => segment && segment !== '.' && segment !== '..'), '运行时诊断绑定路径越界')
  const file = path.resolve(root, ...segments)
  const relative = path.relative(root, file)
  assert(relative && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative), '运行时诊断绑定路径越界')
  return file
}
function normalizeInventory(value, role) {
  assert(value && sha(value.sourceCommit) && sha(value.sourceTree) && path.isAbsolute(value.root ?? '') && Array.isArray(value.files) && value.files.length > 0 && value.files.length <= 4096, `运行时诊断 ${role} 身份清单无效`)
  const paths = new Set()
  const files = value.files.map((item) => {
    const file = bindingFilePath(value.root, item?.relativePath)
    const key = process.platform === 'win32' ? file.toLowerCase() : file
    assert(!paths.has(key) && Number.isSafeInteger(item.bytes) && item.bytes >= 0 && item.bytes <= fileLimit && /^[a-f\d]{64}$/i.test(item.sha256 ?? ''), `运行时诊断 ${role} 文件回执无效或重复`)
    paths.add(key)
    return {
      relativePath: item.relativePath,
      bytes: item.bytes,
      sha256: item.sha256,
    }
  }).sort((left, right) => left.relativePath < right.relativePath ? -1 : left.relativePath > right.relativePath ? 1 : 0)
  return {
    sourceCommit: value.sourceCommit,
    sourceTree: value.sourceTree,
    root: value.root,
    files,
  }
}

/** 验证关键输入回执，不把清单或调用方声明的 Git tree 冒充完整源码树证明。 */
export function normalizeRuntimeBinding(binding) {
  assert(binding?.schemaVersion === 1, '运行时诊断缺少版本化产品/lock/driver 绑定')
  const product = normalizeInventory(binding.product, 'product')
  const driver = normalizeInventory(binding.driver, 'driver')
  const lock = binding.lock
  assert(lock?.relativePath === 'pnpm-lock.yaml', '运行时诊断必须绑定根 pnpm-lock.yaml')
  const listedLock = product.files.find(item => item.relativePath === lock.relativePath)
  assert(listedLock && listedLock.bytes === lock.bytes && listedLock.sha256 === lock.sha256, '运行时诊断 lock 不在 product 身份清单中')
  for (const name of driverModulePaths) {
    assert(driver.files.some(file => file.relativePath === name), `运行时诊断 driver 缺少模块：${name}`)
  }
  const normalized = {
    schemaVersion: 1,
    product,
    lock: {
      relativePath: lock.relativePath,
      bytes: lock.bytes,
      sha256: lock.sha256,
    },
    driver,
  }
  assert(Buffer.byteLength(JSON.stringify(normalized)) <= manifestLimit, '运行时诊断身份清单超过固定字节上限')
  return normalized
}
export function runtimeBindingDigest(binding) {
  return digestBytes(JSON.stringify(normalizeRuntimeBinding(binding)))
}

/** 复制到会话的 helper 还必须等于 driver 清单中的原始字节，不能另立一组自述哈希。 */
export function assertBoundWorkerModule(binding, name, bytes) {
  const relativePath = `benchmark/version-compare/scripts/runtime-diagnostics/${name}`
  const item = binding?.driver?.files?.find(item => item.relativePath === relativePath)
  assert(workerModuleNames.includes(name) && item && item.bytes === bytes.length && item.sha256 === digestBytes(bytes), `运行时诊断 helper 与 driver 绑定不符：${name}`)
}
export function sameRuntimeBindingReceipt(actual, expected) {
  return expected && Object.keys(actual).length === Object.keys(expected).length && Object.entries(actual).every(([name, value]) => expected[name] === value)
}

/** controller、真实业务 preload 和收尾分别重核；Git archive/ls-tree 来源由准备 adapter 证明。 */
export function verifyRuntimeBinding(binding, expected) {
  binding = normalizeRuntimeBinding(binding)
  assert(sameRuntimePath(binding.product.root, expected.root) && binding.product.sourceCommit === expected.sourceCommit, '运行时诊断 product 准备根或提交身份不符')
  if (expected.sourceTree !== undefined) {
    assert(binding.product.sourceTree === expected.sourceTree, '运行时诊断 product tree 身份不符')
  }
  if (expected.driverModule) {
    assert(sameRuntimePath(bindingFilePath(binding.driver.root, expected.driverModule.relativePath), expected.driverModule.file) && binding.driver.files.some(item => item.relativePath === expected.driverModule.relativePath), '运行时诊断实际 driver 不属于绑定清单')
  }
  for (const file of [expected.expectedEntry, expected.manifestPath].filter(Boolean)) {
    assert(binding.product.files.some(item => sameRuntimePath(bindingFilePath(binding.product.root, item.relativePath), file)), '运行时诊断真实入口或 manifest 未列入 product 绑定')
  }
  const budget = {
    bytes: 0,
    maximumBytes: maximumBindingBytes,
  }
  for (const inventory of [binding.product, binding.driver]) {
    for (const item of inventory.files) {
      readBoundedFile(bindingFilePath(inventory.root, item.relativePath), {
        maximumBytes: fileLimit,
        receipt: item,
        budget,
      })
    }
  }
  return {
    schemaVersion: 1,
    sha256: runtimeBindingDigest(binding),
    productTree: binding.product.sourceTree,
    driverCommit: binding.driver.sourceCommit,
    driverTree: binding.driver.sourceTree,
    lockSha256: binding.lock.sha256,
    fileCount: binding.product.files.length + binding.driver.files.length,
    bytes: budget.bytes,
    scope: '只重核清单关键输入；完整 Git tree、archive 来源及安装后全量清单由准备 adapter 提供独立证明',
  }
}
