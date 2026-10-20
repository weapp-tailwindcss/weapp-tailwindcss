import { Buffer } from 'node:buffer'
import fs from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { sha256 } from './archives'

/** 独立 fixture 只接受实际 bundle 的完整 CSS 文本，防止构建成功却改变解码语义。 */
export async function verifyPortableDecoder(artifact: string, fixtureRoot: string) {
  const fixture = JSON.parse(await fs.readFile(path.join(fixtureRoot, 'fixtures', 'selector-identifiers.json'), 'utf8'))
  const bundle = Buffer.from(fixture.bundle.base64, 'base64')
  if (bundle.length !== fixture.bundle.bytes || sha256(bundle) !== fixture.bundle.sha256) {
    throw new Error('实际 bundle fixture 的字节身份不匹配')
  }
  const modulePath = path.join(path.dirname(artifact), 'probe.cjs')
  const require = createRequire(import.meta.url)
  try {
    await fs.copyFile(artifact, modulePath)
    const module = await require(modulePath)()
    const pointer = module._malloc(bundle.length)
    if (!pointer) {
      throw new Error('WASM probe 无法分配输入内存')
    }
    try {
      module.HEAPU8.set(bundle, pointer)
      const result = module._decode(pointer, bundle.length)
      if (result.status !== 0) {
        throw new Error(`WASM probe 解码失败: ${result.result}`)
      }
      const css = JSON.parse(result.result).css.text
      if (typeof css !== 'string' || sha256(Buffer.from(css)) !== fixture.expectedCssSha256) {
        throw new Error('WASM probe 的 CSS 与独立 fixture 不同')
      }
      return { bundleSha256: fixture.bundle.sha256, cssSha256: fixture.expectedCssSha256, selectorRules: fixture.expectedRules.length }
    }
    finally {
      module._free(pointer)
    }
  }
  finally {
    delete require.cache[modulePath]
    await fs.rm(modulePath, { force: true })
  }
}
