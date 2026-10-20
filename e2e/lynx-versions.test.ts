import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { compatibilityVersions } from './lynx/catalog'
import { readHostVersions, readInstalledVersion } from './lynx/versions'

const directories: string[] = []
afterEach(async () => {
  await Promise.all(directories.splice(0).map(directory => fs.rm(directory, { recursive: true, force: true })))
})

describe('Lynx 实际版本身份', () => {
  it('读取真正解析到的包版本，不使用依赖范围或历史报告版本', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'lynx versions '))
    directories.push(root)
    const directory = path.join(root, 'node_modules', '@fixture', 'css-defines')
    await fs.mkdir(directory, { recursive: true })
    await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ dependencies: { '@fixture/css-defines': '^0.0.16' } }))
    await fs.writeFile(path.join(directory, 'package.json'), JSON.stringify({ name: '@fixture/css-defines', version: '0.0.18', exports: './index.js' }))
    await fs.writeFile(path.join(directory, 'index.js'), '')
    expect(readInstalledVersion(path.join(root, 'package.json'), '@fixture/css-defines')).toBe('0.0.18')
  })

  it('host 的两端版本与实际 bundle SDK 必须齐全且一致', () => {
    const ios = 'pod \'Lynx\', \'4.0.1\''
    const android = 'implementation("org.lynxsdk.lynx:lynx:4.0.1")'
    expect(readHostVersions(ios, android, 'pluginReactLynx({ engineVersion: \'3.9\' })')).toEqual({ lynxEngine: '4.0.1', engineVersion: '3.9' })
    expect(() => readHostVersions(ios, android.replace('4.0.1', '4.1.0'), 'engineVersion: \'3.9\'')).toThrow(/不一致/)
    expect(() => readHostVersions(ios, android, '')).toThrow(/缺失/)
  })

  it('当前 css-defines 版本和实际 e2e 包解析一致', () => {
    expect(compatibilityVersions.cssDefines).toBe(readInstalledVersion(path.resolve(import.meta.dirname, 'package.json'), '@lynx-js/css-defines'))
  })
})
