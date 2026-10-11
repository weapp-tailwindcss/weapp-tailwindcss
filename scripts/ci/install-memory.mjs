import { freemem, totalmem } from 'node:os'
import process from 'node:process'
import { needsDarwinMemoryProbe, readDarwinAvailableMemory } from './install-memory-darwin.mjs'

const maximumHeapMb = 4096
const megabyte = 1024 ** 2
const explicitHeap = /--max[-_]old[-_]space[-_]size\b/

/**
 * 读取运行时资源；旧 libuv 的 Darwin available 只统计 free 页，使用与新 libuv 相同的可回收页口径。
 * @param {{ platform: NodeJS.Platform, libuvVersion: string, availableBytes?: number | undefined, freeBytes: number, totalBytes: number, constrainedBytes?: number | undefined }} [resources] 系统读数。
 * @param {() => number} [readDarwinMemory] Darwin 的可回收内存读取入口。
 */
export function readInstallMemoryResources(resources = {
  platform: process.platform,
  libuvVersion: process.versions.uv,
  availableBytes: process.availableMemory?.(),
  freeBytes: freemem(),
  totalBytes: totalmem(),
  constrainedBytes: process.constrainedMemory?.(),
}, readDarwinMemory = readDarwinAvailableMemory) {
  const probeDarwin = needsDarwinMemoryProbe(resources.platform, resources.libuvVersion)
  return {
    availableBytes: probeDarwin ? readDarwinMemory() : resources.availableBytes,
    freeBytes: resources.freeBytes,
    totalBytes: resources.totalBytes,
    constrainedBytes: resources.constrainedBytes,
    source: probeDarwin ? 'darwin-vm-stat' : resources.availableBytes === undefined ? 'os-free' : 'node-available',
  }
}

/**
 * 返回宿主和容器边界内的当前可用内存；未知或耗尽时拒绝放大预算。
 * @param {{ availableBytes?: number | undefined, freeBytes: number, totalBytes: number, constrainedBytes?: number | undefined }} [resources] 当前宿主与容器的内存读数。
 */
export function readAvailableInstallMemory(resources = readInstallMemoryResources()) {
  const available = resources.availableBytes ?? resources.freeBytes
  const limits = [resources.totalBytes, available]
  if (resources.constrainedBytes !== undefined && resources.constrainedBytes !== 0) {
    limits.push(resources.constrainedBytes)
  }
  if (limits.some(limit => !Number.isFinite(limit) || limit <= 0)) {
    throw new Error('无法确定安全的 pnpm 安装内存预算')
  }
  return Math.min(...limits)
}

/**
 * 仅给安装子进程设置有界 heap；保留显式配置，并至少预留一半可用内存给原生分配和其他进程。
 * @param {NodeJS.ProcessEnv} [env] 子进程的原始环境。
 * @param {number} [availableBytes] 已验证口径的可用内存；省略时读取运行时资源。
 */
export function createInstallEnvironment(env = process.env, availableBytes) {
  const options = env.NODE_OPTIONS || ''
  if (explicitHeap.test(options)) {
    return { ...env }
  }
  availableBytes ??= readAvailableInstallMemory()
  if (!Number.isFinite(availableBytes) || availableBytes < 2 * megabyte) {
    throw new Error('无法确定安全的 pnpm 安装内存预算')
  }
  const heapMb = Math.min(maximumHeapMb, Math.floor(availableBytes / megabyte / 2))
  return { ...env, NODE_OPTIONS: `${options}${options ? ' ' : ''}--max-old-space-size=${heapMb}` }
}

/**
 * 为单次安装创建环境和可审计的数值摘要；显式 heap 不读取额外资源，也不暴露环境变量。
 * @param {NodeJS.ProcessEnv} [env] 安装子进程的原始环境。
 * @param {ReturnType<typeof readInstallMemoryResources>} [resources] 本次安装的资源读数。
 */
export function prepareInstallEnvironment(env = process.env, resources) {
  if (explicitHeap.test(env.NODE_OPTIONS || '')) {
    return { environment: { ...env }, memory: { source: 'caller' } }
  }
  resources ??= readInstallMemoryResources()
  const safeAvailableBytes = readAvailableInstallMemory(resources)
  return {
    environment: createInstallEnvironment(env, safeAvailableBytes),
    memory: {
      source: resources.source,
      totalBytes: resources.totalBytes,
      availableBytes: resources.availableBytes ?? resources.freeBytes,
      constrainedBytes: resources.constrainedBytes ?? 0,
      safeAvailableBytes,
      heapMb: Math.min(maximumHeapMb, Math.floor(safeAvailableBytes / megabyte / 2)),
    },
  }
}
