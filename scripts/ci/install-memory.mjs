import { freemem, totalmem } from 'node:os'
import process from 'node:process'

const maximumHeapMb = 4096
const megabyte = 1024 ** 2
const explicitHeap = /--max[-_]old[-_]space[-_]size\b/

/**
 * 返回宿主和容器边界内的当前可用内存；未知或耗尽时拒绝放大预算。
 * @param {{ availableBytes?: number, freeBytes: number, totalBytes: number, constrainedBytes?: number }} [resources] 当前宿主与容器的内存读数。
 */
export function readAvailableInstallMemory(resources = {
  availableBytes: process.availableMemory?.(),
  freeBytes: freemem(),
  totalBytes: totalmem(),
  constrainedBytes: process.constrainedMemory?.(),
}) {
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

/** 仅给安装子进程设置有界 heap；保留显式配置，并至少预留一半可用内存给原生分配和其他进程。 */
export function createInstallEnvironment(env = process.env, availableBytes = readAvailableInstallMemory()) {
  const options = env.NODE_OPTIONS || ''
  if (explicitHeap.test(options)) {
    return { ...env }
  }
  if (!Number.isFinite(availableBytes) || availableBytes < 2 * megabyte) {
    throw new Error('无法确定安全的 pnpm 安装内存预算')
  }
  const heapMb = Math.min(maximumHeapMb, Math.floor(availableBytes / megabyte / 2))
  return { ...env, NODE_OPTIONS: `${options}${options ? ' ' : ''}--max-old-space-size=${heapMb}` }
}
