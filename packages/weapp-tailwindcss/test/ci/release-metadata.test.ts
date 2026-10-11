import { describe, expect, it } from 'vitest'
import { fixture, isMetadata, json } from './release-metadata/fixture'

describe('发布元数据内容分类', () => {
  it('识别单纯版本提升、changelog 新增及 intent ledger 消费', () => {
    expect(isMetadata(fixture())).toBe(true)
  })

  it.each(['scripts', 'exports', 'dependencies', 'engines', 'publishConfig'])('不豁免 manifest 的 %s 变更', (field) => {
    const data = fixture()
    data.head['packages/a/package.json'] = json({ name: 'pkg-a', version: '1.0.1', [field]: { changed: 'value' } })
    expect(isMetadata(data)).toBe(false)
  })

  it.each(['1.0.0', '0.9.0', 'invalid', '01.0.1', 'v1.0.1'])('拒绝非法或未提升版本 %s', (version) => {
    const data = fixture()
    data.head['packages/a/package.json'] = json({ name: 'pkg-a', version })
    expect(isMetadata(data)).toBe(false)
  })

  it.each(['pnpm-lock.yaml', 'packages/a/src/index.ts', '.github/workflows/ci.yml', 'repoctl.config.ts'])('不豁免 %s 的内容变更', (file) => {
    const data = fixture()
    data.head[file] = 'changed\n'
    expect(isMetadata(data)).toBe(false)
  })

  it('拒绝未注册的包和新增包', () => {
    const unregistered = fixture()
    unregistered.base['fixtures/a/package.json'] = json({ name: 'fixture', version: '1.0.0' })
    unregistered.head['fixtures/a/package.json'] = json({ name: 'fixture', version: '1.0.1' })
    expect(isMetadata(unregistered)).toBe(false)
    const added = fixture()
    added.head['packages/new/package.json'] = json({ name: 'new', version: '1.0.0' })
    expect(isMetadata(added)).toBe(false)
  })

  it('拒绝 workspace 排除目录的 manifest', () => {
    const data = fixture()
    data.base['pnpm-workspace.yaml'] = 'packages:\n  - packages/*\n  - "!packages/excluded"\n'
    data.head['pnpm-workspace.yaml'] = data.base['pnpm-workspace.yaml']
    data.base['packages/excluded/package.json'] = json({ name: 'excluded', version: '1.0.0' })
    data.head['packages/excluded/package.json'] = json({ name: 'excluded', version: '1.0.1' })
    expect(isMetadata(data)).toBe(false)
  })

  it.each(['missing', 'old-record', 'wrong-version', 'extra-version'])('拒绝无效 changelog：%s', (kind) => {
    const data = fixture()
    const file = 'packages/a/CHANGELOG.md'
    if (kind === 'missing') {
      data.head[file] = data.base[file]
    }
    else if (kind === 'old-record') {
      data.head[file] = data.head[file].replace('已有记录。', '改写旧记录。')
    }
    else if (kind === 'wrong-version') {
      data.head[file] = data.head[file].replace('## 1.0.1', '## 1.0.2')
    }
    else {
      data.head[file] = data.head[file].replace('## 1.0.1', '## 1.0.2\n\n## 1.0.1')
    }
    expect(isMetadata(data)).toBe(false)
  })

  it('允许首次创建已存在包的 changelog', () => {
    const data = fixture()
    delete data.base['packages/a/CHANGELOG.md']
    data.head['packages/a/CHANGELOG.md'] = '# pkg-a\n\n## 1.0.1\n\n中文版本记录。\n'
    expect(isMetadata(data)).toBe(true)
  })

  it('保留与 manifest 名称不同的旧标题及 CRLF 记录', () => {
    const data = fixture()
    for (const files of [data.base, data.head]) {
      files['packages/a/CHANGELOG.md'] = files['packages/a/CHANGELOG.md'].replace('# pkg-a', '# package-directory').replaceAll('\n', '\r\n')
    }
    expect(isMetadata(data)).toBe(true)
  })

  it.each(['existing-entry', 'unconsumed-intent', 'wrong-dir', 'missing-entry'])('拒绝无效 ledger：%s', (kind) => {
    const data = fixture()
    const file = '.changeset/ledger.yaml'
    if (kind === 'existing-entry') {
      data.head[file] = data.head[file].replace('previous', 'altered')
    }
    else if (kind === 'unconsumed-intent') {
      data.head[file] = data.head[file].replace('[example]', '[unknown]')
    }
    else if (kind === 'wrong-dir') {
      data.head[file] = data.head[file].replace(/packages\/a/g, 'packages/other')
    }
    else {
      data.head[file] = data.base[file]
    }
    expect(isMetadata(data)).toBe(false)
  })

  it('拒绝 intent 新增、未完整消费、无对应 bump 或不满足请求的版本', () => {
    for (const kind of ['added', 'retained', 'wrong-package', 'minor']) {
      const data = fixture()
      if (kind === 'added') {
        data.head['.changeset/new.md'] = data.base['.changeset/example.md']
      }
      else if (kind === 'retained') {
        data.head['.changeset/example.md'] = data.base['.changeset/example.md']
      }
      else {
        data.base['.changeset/example.md'] = data.base['.changeset/example.md'].replace(kind === 'minor' ? 'patch' : 'pkg-a', kind === 'minor' ? 'minor' : 'other')
      }
      expect(isMetadata(data)).toBe(false)
    }
  })

  it('要求 fixed group 所有成员同步提升到同一版本', () => {
    const data = fixture()
    data.base['pnpm-workspace.yaml'] += 'versioning:\n  fixed:\n    - [pkg-a, pkg-b]\n'
    data.head['pnpm-workspace.yaml'] = data.base['pnpm-workspace.yaml']
    data.base['packages/b/package.json'] = json({ name: 'pkg-b', version: '1.0.0' })
    data.head['packages/b/package.json'] = data.base['packages/b/package.json']
    data.base['packages/b/CHANGELOG.md'] = '# pkg-b\n\n## 1.0.0\n'
    data.head['packages/b/CHANGELOG.md'] = data.base['packages/b/CHANGELOG.md']
    expect(isMetadata(data)).toBe(false)
    data.head['packages/b/package.json'] = json({ name: 'pkg-b', version: '1.0.1' })
    data.head['packages/b/CHANGELOG.md'] = '# pkg-b\n\n## 1.0.1\n\n## 1.0.0\n'
    expect(isMetadata(data)).toBe(true)
    data.head['packages/b/package.json'] = json({ name: 'pkg-b', version: '1.0.2' })
    expect(isMetadata(data)).toBe(false)
  })

  it.each(['workspace:*', 'workspace:^', 'workspace:~', 'workspace:^1.0.0', 'workspace:pkg-a@^1.0.0', 'workspace:../a'])('校验有效 workspace 协议：%s', (specifier) => {
    const data = fixture()
    const owner = json({ name: 'pkg-b', version: '1.0.0', dependencies: { 'pkg-a': specifier } })
    data.base['packages/b/package.json'] = owner
    data.head['packages/b/package.json'] = owner
    expect(isMetadata(data)).toBe(true)
  })

  it.each(['workspace:1.0.0', 'workspace:missing@*', 'workspace:../../outside', 'workspace:invalid'])('拒绝无法满足的 workspace 协议：%s', (specifier) => {
    const data = fixture()
    const owner = json({ name: 'pkg-b', version: '1.0.0', dependencies: { 'pkg-a': specifier } })
    data.base['packages/b/package.json'] = owner
    data.head['packages/b/package.json'] = owner
    expect(isMetadata(data)).toBe(false)
  })

  it('拒绝损坏的 JSON、YAML 和重复 workspace 包身份', () => {
    for (const file of ['packages/a/package.json', '.changeset/ledger.yaml', 'pnpm-workspace.yaml']) {
      const data = fixture()
      data.head[file] = '{ invalid'
      expect(isMetadata(data)).toBe(false)
    }
    const data = fixture()
    data.base['packages/b/package.json'] = data.head['packages/b/package.json'] = json({ name: 'pkg-a', version: '1.0.0' })
    expect(isMetadata(data)).toBe(false)
  })
})
