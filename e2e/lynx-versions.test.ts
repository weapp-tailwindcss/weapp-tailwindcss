import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { compatibilityVersions } from './lynx/catalog'
import { readCompatibilityVersions, readHostVersions, readInstalledVersion } from './lynx/versions'

const directories: string[] = []
afterEach(async () => {
  await Promise.all(directories.splice(0).map(directory => fs.rm(directory, { recursive: true, force: true })))
})

async function writeInstalledPackage(fromDirectory: string, name: string, version: string, typesOnly = false) {
  const directory = path.join(fromDirectory, 'node_modules', name)
  await fs.mkdir(directory, { recursive: true })
  await fs.writeFile(path.join(directory, 'package.json'), JSON.stringify({
    name,
    version,
    exports: typesOnly
      ? { '.': { types: './index.d.ts' } }
      : { '.': './index.js', './package.json': './package.json' },
  }))
  await fs.writeFile(path.join(directory, typesOnly ? 'index.d.ts' : 'index.js'), '')
  return directory
}

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

  it('仅 types 条件导出的包仍读取当前调用者实际安装的 manifest，并拒绝身份混淆', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'lynx types versions '))
    directories.push(root)
    const manifest = path.join(root, 'package.json')
    await fs.writeFile(manifest, '{}')
    const directory = await writeInstalledPackage(root, '@fixture/types', '4.3.0', true)
    expect(readInstalledVersion(manifest, '@fixture/types')).toBe('4.3.0')
    await fs.writeFile(path.join(directory, 'package.json'), JSON.stringify({ name: '@fixture/other', version: '4.3.0', exports: { '.': { types: './index.d.ts' } } }))
    expect(() => readInstalledVersion(manifest, '@fixture/types')).toThrow(/实际包身份不一致/)
  })

  it('工具链身份来自实际安装与生产模板依赖，encoder 不借用顶层或独立 decoder 版本', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'lynx toolchain versions '))
    directories.push(root)
    const example = path.join(root, 'examples', 'react-lynx')
    const e2e = path.join(root, 'e2e')
    const host = path.join(e2e, 'fixtures', 'lynx-native')
    await Promise.all([
      fs.mkdir(example, { recursive: true }),
      fs.mkdir(path.join(host, 'ios'), { recursive: true }),
      fs.mkdir(path.join(host, 'android', 'app'), { recursive: true }),
    ])
    await Promise.all([
      fs.writeFile(path.join(example, 'package.json'), JSON.stringify({ dependencies: { '@lynx-js/react': '^0.126.0', '@lynx-js/rspeedy': '^0.17.0' } })),
      fs.writeFile(path.join(e2e, 'package.json'), JSON.stringify({ dependencies: { '@lynx-js/tasm': '0.0.53' } })),
      fs.writeFile(path.join(example, 'lynx.config.ts'), 'pluginReactLynx({ engineVersion: \'3.9\' })'),
      fs.writeFile(path.join(host, 'ios', 'Podfile'), 'pod \'Lynx\', \'4.0.1\''),
      fs.writeFile(path.join(host, 'android', 'app', 'build.gradle.kts'), 'implementation("org.lynxsdk.lynx:lynx:4.0.1")'),
      writeInstalledPackage(example, 'tailwindcss', '4.3.3'),
      writeInstalledPackage(example, '@lynx-js/react', '0.129.0'),
      writeInstalledPackage(example, '@lynx-js/rspeedy', '0.18.3'),
      writeInstalledPackage(example, '@lynx-js/types', '4.3.0', true),
      writeInstalledPackage(example, '@lynx-js/template-webpack-plugin', '9.9.9'),
      writeInstalledPackage(example, '@lynx-js/tasm', '0.0.53'),
      writeInstalledPackage(e2e, '@lynx-js/css-defines', '0.0.18'),
      writeInstalledPackage(e2e, '@lynx-js/tasm', '0.0.53'),
    ])
    const plugin = await writeInstalledPackage(example, '@lynx-js/react-rsbuild-plugin', '0.22.0')
    const template = await writeInstalledPackage(plugin, '@lynx-js/template-webpack-plugin', '0.16.5')
    await Promise.all([
      writeInstalledPackage(template, '@lynx-js/tasm', '0.0.49'),
      writeInstalledPackage(template, '@lynx-js/css-serializer', '0.1.9'),
    ])
    const first = readCompatibilityVersions(root)
    expect(first).toMatchObject({
      reactLynx: '0.129.0',
      reactRsbuildPlugin: '0.22.0',
      rspeedy: '0.18.3',
      lynxTypes: '4.3.0',
      templateWebpackPlugin: '0.16.5',
      tasmEncoder: '0.0.49',
      cssSerializer: '0.1.9',
      lynxEngine: '4.0.1',
      engineVersion: '3.9',
    })
    expect(first.tasmDecoder).toMatch(/^0\.0\.53\+/)
    await fs.writeFile(path.join(plugin, 'package.json'), JSON.stringify({ name: '@lynx-js/react-rsbuild-plugin', version: '0.22.1', exports: { '.': './index.js', './package.json': './package.json' } }))
    expect(readCompatibilityVersions(root)).toEqual({ ...first, reactRsbuildPlugin: '0.22.1' })
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
