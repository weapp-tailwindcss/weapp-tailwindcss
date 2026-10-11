import { describe, expect, it } from 'vitest'
import { resolveScopes } from '../../../../scripts/ci/resolve-pr-scope.mjs'

describe('PR 变更范围解析', () => {
  it('将 Windows 路径归一化后识别核心与平台范围', () => {
    const scopes = resolveScopes([
      'packages\\weapp-tailwindcss\\src\\bundlers\\vite.ts',
      'examples\\react-native-expo\\package.json',
    ])

    expect(scopes).toMatchObject({
      core: true,
      watch: true,
      benchmark: true,
      'react-native': true,
    })
  })

  it('将文档和 changeset-only 变更排除在代码门禁之外', () => {
    expect(resolveScopes(['README.md', '.changeset/example.md'])).toEqual({
      core: false,
      watch: false,
      benchmark: false,
      release: false,
      website: false,
      templates: false,
      'react-native': false,
      lynx: false,
      hbuilderx: false,
      has_changes: true,
    })
  })

  it('为模板、网站和发布元数据启用对应专项范围', () => {
    const scopes = resolveScopes([
      'templates/uni-app-tailwindcss-v4/package.json',
      'website/docs/guide/ci.mdx',
      'packages-runtime/merge/package.json',
    ])

    expect(scopes).toMatchObject({
      core: true,
      watch: true,
      release: true,
      website: true,
      templates: true,
    })
  })
})
