import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { limits } from './identity.mjs'

export function logSink(file, fail) {
  const descriptor = fs.openSync(file, 'wx')
  const digest = createHash('sha256')
  let observedBytes = 0
  let storedBytes = 0
  let incomplete = false
  return {
    consume(chunk) {
      observedBytes += chunk.length
      if (incomplete) {
        return
      }
      if (observedBytes > limits.logBytesPerStream) {
        incomplete = true
        fail('log-limit', new Error(`原始日志超过固定上限：${file}`))
        return
      }
      try {
        let offset = 0
        while (offset < chunk.length) {
          const written = fs.writeSync(descriptor, chunk, offset, chunk.length - offset)
          if (written < 1) {
            throw new Error('原始日志写入未推进')
          }
          digest.update(chunk.subarray(offset, offset + written))
          storedBytes += written
          offset += written
        }
      }
      catch (error) {
        incomplete = true
        fail('log-write', error)
      }
    },
    close() {
      try {
        fs.closeSync(descriptor)
      }
      catch (error) {
        incomplete = true
        fail('log-close', error)
      }
      return {
        physical: file,
        bytes: storedBytes,
        observedBytes,
        discardedBytes: observedBytes - storedBytes,
        sha256: digest.digest('hex'),
        complete: !incomplete,
      }
    },
  }
}
export function artifactBytes(directory) {
  const entries = fs.readdirSync(directory, {
    withFileTypes: true,
  })
  let profiles = 0
  let profileFiles = 0
  let total = 0
  for (const entry of entries) {
    if (!entry.isFile()) {
      throw new Error(`证据目录出现未知文件类型：${entry.name}`)
    }
    const size = fs.statSync(path.join(directory, entry.name)).size
    total += size
    if (entry.name.endsWith('.cpuprofile')) {
      profiles += size
      profileFiles++
    }
    if (entry.name === 'loaded-cjs.json' && size > limits.loadedManifestBytes) {
      throw new Error('CJS manifest 超过固定上限')
    }
  }
  if (profileFiles > limits.profileFiles || profiles > limits.profilesBytes || total > limits.runArtifactBytes) {
    throw new Error('CPU 证据超过 profile 数量、总字节或单次证据固定上限')
  }
}
