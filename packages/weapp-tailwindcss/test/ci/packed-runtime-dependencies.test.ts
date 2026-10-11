import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { collectRuntimePackages, createPnpmFileSpecifier } from '../../../../scripts/ci/pack-runtime-dependencies.mjs'

function pkg(name: string, fields: Record<string, Record<string, string>> = {}) {
  return { manifest: { name, ...fields } }
}

describe('候选包的运行时依赖闭包', () => {
  it('包含 PostCSS 及其 calc 依赖，避免新核心包安装已发布的旧 helper', () => {
    const packages = [
      pkg('weapp-tailwindcss', {
        dependencies: { '@weapp-tailwindcss/postcss': 'workspace:*', postcss: '^8.5.0' },
        devDependencies: { 'test-helper': 'workspace:*' },
      }),
      pkg('@weapp-tailwindcss/postcss', { dependencies: { '@weapp-tailwindcss/postcss-calc': 'workspace:*' } }),
      pkg('@weapp-tailwindcss/postcss-calc'),
      pkg('test-helper'),
    ]
    expect(collectRuntimePackages(packages, 'weapp-tailwindcss').map(item => item.manifest.name)).toEqual([
      'weapp-tailwindcss', '@weapp-tailwindcss/postcss', '@weapp-tailwindcss/postcss-calc',
    ])
  })

  it('去重循环依赖，并包含 workspace 可选依赖和 peer 依赖', () => {
    const packages = [
      pkg('entry', { optionalDependencies: { optional: 'workspace:^' }, peerDependencies: { peer: 'workspace:~' } }),
      pkg('optional', { dependencies: { entry: 'workspace:*', peer: 'workspace:*' } }),
      pkg('peer'),
    ]
    expect(collectRuntimePackages(packages, 'entry').map(item => item.manifest.name)).toEqual(['entry', 'optional', 'peer'])
  })

  it('缺失 workspace 依赖时明确失败，不能静默回退到 npm 发布版', () => {
    expect(() => collectRuntimePackages([pkg('entry', { dependencies: { missing: 'workspace:*' } })], 'entry'))
      .toThrow('缺少 workspace 运行时依赖：missing')
  })

  it.each([
    [path.posix, '/tmp/space root/project', '/tmp/space root/packed/core.tgz', 'file:../packed/core.tgz'],
    [path.posix, '/', '/packed/core.tgz', 'file:packed/core.tgz'],
    [path.posix, 'project', 'packed/core.tgz', 'file:../packed/core.tgz'],
    [path.win32, 'C:\\space root\\project', 'C:\\space root\\packed\\core.tgz', 'file:../packed/core.tgz'],
    [path.win32, 'C:\\', 'C:\\packed\\core.tgz', 'file:packed/core.tgz'],
    [path.win32, 'C:\\project', 'D:\\packed\\core.tgz', 'file:D:/packed/core.tgz'],
    [path.win32, 'project', 'packed\\core.tgz', 'file:../packed/core.tgz'],
  ])('使用路径 API 生成可安装的 file: 说明符 %#', (pathApi, from, tarball, expected) => {
    expect(createPnpmFileSpecifier(from, tarball, pathApi)).toBe(expected)
  })
})
