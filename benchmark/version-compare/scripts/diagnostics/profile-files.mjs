import { Buffer } from 'node:buffer'
import fs from 'node:fs/promises'
import path from 'node:path'
import { limits } from './constants.mjs'
import { evidenceLimitError } from './evidence.mjs'
import { decodeAllocationEvidence } from './profile-codec.mjs'

export async function readAllocationEvidenceFile(file, receipt, expectedKind) {
  const filename = path.basename(file)
  if (!receipt || !Number.isSafeInteger(receipt.bytes) || receipt.bytes < 0 || typeof receipt.sha256 !== 'string' || !/^[a-f\d]{64}$/.test(receipt.sha256)) {
    throw new Error(`分配证据缺失或非法 receipt：${filename}`)
  }
  const handle = await fs.open(file, 'r')
  try {
    const { size } = await handle.stat()
    if (size > limits.maxProfileBytes) {
      throw evidenceLimitError({ filename, bytes: size, maximum: limits.maxProfileBytes, bytesWritten: 0, scope: 'encoded-read' })
    }
    // 多读一字节检测写入竞争；不让 stat 之后增长的文件触发无界 readFile 分配。
    const buffer = Buffer.alloc(size + 1)
    let offset = 0
    while (offset < buffer.length) {
      const { bytesRead } = await handle.read(buffer, offset, buffer.length - offset, null)
      if (bytesRead === 0) {
        break
      }
      offset += bytesRead
    }
    if (offset !== size) {
      throw new Error(`读取期间分配证据文件尺寸改变：${filename}`)
    }
    return decodeAllocationEvidence(buffer.subarray(0, size), receipt, filename, expectedKind)
  }
  finally {
    await handle.close()
  }
}
