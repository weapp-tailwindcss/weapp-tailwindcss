import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { stageCaptureAssets } from './lynx/capture-assets'
import { parseNativeRunArgs } from './lynx/native-options'

const temporary: string[] = []
afterEach(async () => {
  await Promise.all(temporary.splice(0).map(root => fs.rm(root, { recursive: true, force: true })))
})

async function workspace() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'lynx-capture-assets-'))
  temporary.push(root)
  const source = path.join(root, 'dist')
  const host = path.join(root, 'host')
  const artifacts = path.join(root, 'artifacts')
  await Promise.all([source, host, artifacts].map(directory => fs.mkdir(directory)))
  return { source, host, artifacts }
}

describe('原生录制本地图片归档', () => {
  it('仅在显式 capture-only 中接受实际资产根目录', () => {
    const root = path.resolve('workspace')
    expect(parseNativeRunArgs(['ios', '--capture-only', '--bundle', 'main.bundle', '--assets', 'dist'], root).assetsPath).toBe(path.join(root, 'dist'))
    expect(() => parseNativeRunArgs(['ios', '--assets', 'dist'], root)).toThrow('--assets requires --capture-only')
  })

  it('保留嵌套 emitted 资产名、图片字节及摘要，排除非图片产物', async () => {
    const { source, host, artifacts } = await workspace()
    const nested = path.join('static', 'image', 'avatar.123.jpg')
    const bytes = Buffer.from([0xFF, 0xD8, 0xFF, 0xD9])
    await fs.mkdir(path.dirname(path.join(source, nested)), { recursive: true })
    await fs.writeFile(path.join(source, nested), bytes)
    await fs.writeFile(path.join(source, 'main.lynx.bundle'), 'bundle')
    await fs.mkdir(path.join(host, 'capture-assets'))
    await fs.writeFile(path.join(host, 'capture-assets', 'stale.png'), 'old')
    const files = await stageCaptureAssets(source, host, artifacts)
    expect(files).toEqual([{ name: 'static/image/avatar.123.jpg', sha256: crypto.createHash('sha256').update(bytes).digest('hex') }])
    for (const root of [host, artifacts]) {
      expect(await fs.readFile(path.join(root, 'capture-assets', nested))).toEqual(bytes)
      expect(await fs.stat(path.join(root, 'capture-assets', 'stale.png')).catch(() => undefined)).toBeUndefined()
      expect(await fs.stat(path.join(root, 'capture-assets', 'main.lynx.bundle')).catch(() => undefined)).toBeUndefined()
    }
    expect(JSON.parse(await fs.readFile(path.join(artifacts, 'capture-assets.json'), 'utf8'))).toEqual({ version: 1, files })
  })

  it('拒绝空图片目录，不将内联字符串当作本地资产', async () => {
    const { source, host, artifacts } = await workspace()
    await fs.writeFile(path.join(source, 'main.lynx.bundle'), 'data:image/jpeg;base64,not-a-file')
    await expect(stageCaptureAssets(source, host, artifacts)).rejects.toThrow('缺少本地位图')
  })

  it('拒绝符号链接，防止归档脱离显式资产根目录', async () => {
    const { source, host, artifacts } = await workspace()
    await fs.symlink(artifacts, path.join(source, 'outside'), process.platform === 'win32' ? 'junction' : 'dir')
    await expect(stageCaptureAssets(source, host, artifacts)).rejects.toThrow('禁止符号链接')
  })
})
