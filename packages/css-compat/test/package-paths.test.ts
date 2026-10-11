import fs from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { install, pack } from '../scripts/package-utils.mjs'

async function installedTarballURL(consumer: string) {
  const manifest = JSON.parse(await fs.readFile(path.join(consumer, 'package.json'), 'utf8'))
  const url = new URL(manifest.dependencies['css-compat-path-fixture'])
  expect(url.protocol).toBe('http:')
  expect(url.hostname).toBe('127.0.0.1')
  expect(Number(url.port)).toBeGreaterThan(0)
  expect(url.pathname).toBe('/tarball-0.tgz')
  return url
}

describe('公开 tarball 安装的物理路径与 URL 边界', () => {
  it('在包含空格、波浪号、井号、百分号和 Unicode 的真实路径中打包并隔离安装', async () => {
    const root = await fs.mkdtemp(path.join(tmpdir(), 'css compat ~ #% 中文 '))
    try {
      const source = path.join(root, 'source ~ #% 中文')
      await fs.mkdir(source)
      await fs.writeFile(path.join(source, 'package.json'), JSON.stringify({
        name: 'css-compat-path-fixture',
        version: '0.0.0',
        license: 'MIT',
        marker: '真实特殊路径消费成功',
      }))
      const tarball = await pack(root, source)
      const consumer = path.join(root, 'consumer ~ #% 中文')
      // Windows runner 的仓库与 os.tmpdir 可位于不同盘符；直接读取绝对物理路径，不计算相对盘符关系。
      await install(consumer, {}, { 'css-compat-path-fixture': tarball })
      const require = createRequire(path.join(consumer, 'package.json'))
      expect(require('css-compat-path-fixture/package.json').marker).toBe('真实特殊路径消费成功')
      const url = await installedTarballURL(consumer)
      await expect(fetch(url)).rejects.toThrow()
    }
    finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  }, 60_000)

  it('安装失败也关闭本次创建的 loopback server', async () => {
    const root = await fs.mkdtemp(path.join(tmpdir(), 'css compat failed ~ #% 中文 '))
    try {
      const tarball = path.join(root, 'invalid ~ #%.tgz')
      await fs.writeFile(tarball, '不是有效的 tarball')
      const consumer = path.join(root, 'consumer ~ #% 中文')
      await expect(install(consumer, { 'invalid-protocol-fixture': 'unsupported:fixture' }, { 'css-compat-path-fixture': tarball })).rejects.toThrow()
      const url = await installedTarballURL(consumer)
      await expect(fetch(url)).rejects.toThrow()
    }
    finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  }, 60_000)
})
