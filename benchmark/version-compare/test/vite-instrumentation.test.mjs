import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, expect, it } from 'vitest'
import { allocationProject } from '../scripts/diagnostics/constants.mjs'
import { generationTargets } from '../scripts/diagnostics/operation-instrumentation.mjs'
import { prepareAllocationRoot } from '../scripts/diagnostics/prepare.mjs'

const roots = []
const sourceRoot = fileURLToPath(new URL('../../../', import.meta.url))
const store = 'packages/weapp-tailwindcss/src/project-sources/candidates/store.ts'
const bundle = 'packages/weapp-tailwindcss/src/bundlers/vite/generate-bundle/finalize/bundle.ts'
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => fs.rm(root, { recursive: true, force: true })))
})

it.each([allocationProject, 'demo-taro-vite-react-tailwindcss-v4__mp-weixin'])('Vite %s 的全部真实锚点先验证，再写入全部生成能力', async (project) => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'vite-instrumentation-'))
  roots.push(temporary)
  const root = path.join(temporary, 'copy')
  const service = generationTargets.find(([kind]) => kind === 'service')[1]
  for (const relative of [store, bundle, ...generationTargets.map(([, file]) => file)]) {
    const file = path.join(root, relative)
    await fs.mkdir(path.dirname(file), { recursive: true })
    await fs.copyFile(path.join(sourceRoot, relative), file)
  }
  const original = await fs.readFile(path.join(root, store), 'utf8')
  const serviceSource = await fs.readFile(path.join(root, service), 'utf8')
  await fs.writeFile(path.join(root, service), serviceSource.replaceAll('createGeneratorServiceKey(', 'unknownKey('))
  await expect(prepareAllocationRoot(root, sourceRoot, path.join(temporary, 'evidence'), project)).rejects.toThrow('锚点')
  expect(await fs.readFile(path.join(root, store), 'utf8')).toBe(original)
  await fs.writeFile(path.join(root, service), serviceSource)
  const manifest = await prepareAllocationRoot(root, sourceRoot, path.join(temporary, 'evidence'), project)
  expect(manifest.map(item => item.anchor.kind)).toEqual(['store', 'compilation', 'generator', 'native', 'engine', 'compile', 'service'])
  expect(manifest.every(item => item.originalSha256 !== item.instrumentedSha256)).toBe(true)
  await expect(prepareAllocationRoot(root, sourceRoot, path.join(temporary, 'again'), project)).rejects.toThrow('重复')
})
