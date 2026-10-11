import type { MetroConfigLike } from '../packages/react-native/src/metro'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { execa } from 'execa'
import { beforeAll, expect, it } from 'vitest'
import { getRegisteredVirtualModule, VIRTUAL_MANIFEST_MODULE, withWeappTailwindcss } from '../packages/react-native/src/metro'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const transformer = pathToFileURL(path.join(repoRoot, 'packages/react-native/dist/metro-transformer.js')).href

beforeAll(async () => {
  await execa('pnpm', ['--filter', '@weapp-tailwindcss/react-native', 'build'], { cwd: repoRoot })
}, 60_000)

it.each([false, true])('真实独立 worker 从当前发布重新生成虚拟模块（保留自定义字段：%s）', async (customMetadata) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'rn-worker-'))
  const original = path.join(root, 'transformer.cjs')
  await fs.writeFile(original, 'exports.transform = (_config, _root, _filename, data) => ({ code: data.toString() })')
  const config = await withWeappTailwindcss<MetroConfigLike>({ transformerPath: original }, { projectRoot: root, css: '.probe { background-color: #f59e0b }' })
  const virtual = config.resolver!.resolveRequest!({}, VIRTUAL_MANIFEST_MODULE, 'ios') as { filePath: string }
  const entry = getRegisteredVirtualModule(virtual.filePath)!
  try {
    await entry.ready
    const fields = customMetadata ? config.transformer : { weappTailwindcssOriginalTransformerPath: original }
    const child = await execa(process.execPath, ['--input-type=module', '-e', `
      import { transform } from ${JSON.stringify(transformer)};
      const result = await transform(${JSON.stringify(fields)}, ${JSON.stringify(root)}, ${JSON.stringify(virtual.filePath)}, Buffer.from('stale-empty-virtual-module'), {});
      process.stdout.write(result.code);
    `])
    expect(child.stdout).toContain('setManifest(')
    expect(child.stdout).toContain('"backgroundColor":"#f59e0b"')
    expect(child.stdout).not.toContain('stale-empty-virtual-module')
  }
  finally {
    await fs.rm(root, { recursive: true, force: true })
    await fs.rm(entry.manifestPath, { force: true })
    await fs.rm(entry.manifestReadyPath, { force: true })
  }
})
