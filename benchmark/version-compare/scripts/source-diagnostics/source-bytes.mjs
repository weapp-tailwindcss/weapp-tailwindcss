import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { sha256 } from './files.mjs'

const gitHash = (bytes, objectFormat) => createHash(objectFormat).update(`blob ${bytes.length}\0`).update(bytes).digest('hex')

/** 同时证明 canonical Git 内容与本轮实际导出内容，不把换行规范化当成改写豁免。 */
export function sourceByteIdentity(source, bytes, objectFormat, previous) {
  const actualSha256 = sha256(bytes)
  if (previous && (previous.bytes !== bytes.length || previous.sha256 !== actualSha256)) {
    throw new Error(`安装/构建改写 tracked 输入：${source.logical}`)
  }
  const attributes = source.archiveAttributes
  const convertCrLf = source.mode !== '120000' && attributes?.text === 'set' && attributes.eol === 'crlf'
  let canonical = bytes
  if (convertCrLf) {
    let lineFeeds = 0
    for (let index = 0; index < bytes.length; index++) {
      if (bytes[index] === 13 && bytes[index + 1] !== 10) {
        throw new Error(`CRLF 导出含孤立 CR：${source.logical}`)
      }
      if (bytes[index] === 10) {
        if (index === 0 || bytes[index - 1] !== 13) {
          throw new Error(`CRLF 导出含未配对 LF：${source.logical}`)
        }
        lineFeeds++
      }
    }
    canonical = Buffer.alloc(bytes.length - lineFeeds)
    let cursor = 0
    for (const value of bytes) {
      if (value !== 13) {
        canonical[cursor++] = value
      }
    }
  }
  if (gitHash(canonical, objectFormat) !== source.gitBlob) {
    throw new Error(`tracked 源文件与准确 Git tree 不一致：${source.logical}`)
  }
  const identity = {
    gitBytes: canonical.length,
    gitSha256: sha256(canonical),
    archiveTransform: convertCrLf ? 'lf-to-crlf' : 'identity',
    bytes: bytes.length,
    sha256: actualSha256,
  }
  if (previous && ['gitBytes', 'gitSha256', 'archiveTransform'].some(key => previous[key] !== identity[key])) {
    throw new Error(`tracked canonical/export 身份变化：${source.logical}`)
  }
  return identity
}
