import { fileURLToPath } from 'node:url'
import { brotliCompressSync, gzipSync } from 'node:zlib'

export async function measureRuntimeBundles() {
  const { build } = await import('esbuild')
  const entries = ['@weapp-tailwindcss/cn', '@weapp-tailwindcss/merge']
  const bundles = []
  for (const name of entries) {
    const entry = fileURLToPath(await import.meta.resolve(name))
    const result = await build({ entryPoints: [entry], bundle: true, minify: true, write: false, format: 'esm', platform: 'neutral' })
    const bytes = result.outputFiles[0]?.contents
    if (!bytes) {
      throw new Error(`bundle output is empty: ${name}`)
    }
    bundles.push({ name, rawBytes: bytes.byteLength, gzipBytes: gzipSync(bytes, { level: 9 }).byteLength, brotliBytes: brotliCompressSync(bytes).byteLength })
  }
  return bundles
}
