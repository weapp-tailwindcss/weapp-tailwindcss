import fs from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'
import { validateVersionPrDiff } from '../../../../../scripts/ci/version-pr-route.mjs'
import { gitFixture, initialReleaseFixture, isMetadata, json } from './fixture'

const directories: string[] = []

afterEach(() => {
  for (const directory of directories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

describe('发布元数据中的首发包', () => {
  it.each([false, true])('允许保持已注册 manifest 版本的首发，伴随升版=%s', (withVersionBump) => {
    expect(isMetadata(initialReleaseFixture(withVersionBump))).toBe(true)
  })

  it.each(['patch', 'minor', 'major'])('首发消费 %s intent 时采用当前 manifest 版本', (kind) => {
    const data = initialReleaseFixture()
    data.base['.changeset/initial.md'] = data.base['.changeset/initial.md'].replace('minor', kind)
    expect(isMetadata(data)).toBe(true)
  })

  it.each([false, true])('真实 Git 的版本专用校验接受首发，伴随升版=%s', (withVersionBump) => {
    const { cwd, before, after } = gitFixture(initialReleaseFixture(withVersionBump))
    directories.push(cwd)
    expect(() => validateVersionPrDiff({ base: before, head: after }, cwd)).not.toThrow()
  })

  it.each(['private', 'unregistered', 'added', 'changed', 'invalid-version'])('拒绝不符合首发身份的 manifest：%s', (kind) => {
    const data = initialReleaseFixture(true)
    const file = 'packages/new/package.json'
    if (kind === 'private' || kind === 'invalid-version') {
      data.base[file] = data.head[file] = json({ name: 'pkg-new', version: kind === 'private' ? '0.1.0' : 'invalid', private: kind === 'private' })
    }
    else if (kind === 'unregistered') {
      data.base['pnpm-workspace.yaml'] += '  - "!packages/new"\n'
      data.head['pnpm-workspace.yaml'] = data.base['pnpm-workspace.yaml']
    }
    else if (kind === 'added') {
      delete data.base[file]
    }
    else {
      data.head[file] = json({ name: 'pkg-new', version: '0.1.0', scripts: { build: 'changed' } })
    }
    expect(isMetadata(data)).toBe(false)
  })

  it('已有任意版本 ledger 记录的包不能伪装为首发', () => {
    const data = initialReleaseFixture(true)
    const history = '"pkg-new@0.0.1":\n  dir: packages/new\n  intents: [previous]\n'
    data.base['.changeset/ledger.yaml'] += history
    data.head['.changeset/ledger.yaml'] += history
    expect(isMetadata(data)).toBe(false)
  })

  it('首发与已有包组成 fixed group 时仍要求所有成员同步到同一版本', () => {
    const data = initialReleaseFixture(true)
    data.base['pnpm-workspace.yaml'] += 'versioning:\n  fixed:\n    - [pkg-a, pkg-new]\n'
    data.head['pnpm-workspace.yaml'] = data.base['pnpm-workspace.yaml']
    expect(isMetadata(data)).toBe(false)
    data.base['packages/new/package.json'] = data.head['packages/new/package.json'] = json({ name: 'pkg-new', version: '1.0.1' })
    data.head['packages/new/CHANGELOG.md'] = data.head['packages/new/CHANGELOG.md'].replace('0.1.0', '1.0.1')
    data.head['.changeset/ledger.yaml'] = data.head['.changeset/ledger.yaml'].replace('pkg-new@0.1.0', 'pkg-new@1.0.1')
    expect(isMetadata(data)).toBe(true)
    data.head['packages/a/package.json'] = data.base['packages/a/package.json']
    data.head['packages/a/CHANGELOG.md'] = data.base['packages/a/CHANGELOG.md']
    expect(isMetadata(data)).toBe(false)
  })

  it('保留已有 changelog 的包不能按首发消费 intent', () => {
    const data = initialReleaseFixture(true)
    const file = 'packages/new/CHANGELOG.md'
    data.base[file] = '# pkg-new\n\n## 0.0.1\n\n已有发布。\n'
    data.head[file] += data.base[file].slice('# pkg-new\n\n'.length)
    expect(isMetadata(data)).toBe(false)
  })

  it.each(['changelog', 'intent', 'retained-intent', 'invalid-kind', 'ledger', 'wrong-version', 'wrong-dir', 'wrong-intent'])('拒绝不完整或不匹配的首发证据：%s', (kind) => {
    const data = initialReleaseFixture(true)
    if (kind === 'changelog') {
      delete data.head['packages/new/CHANGELOG.md']
    }
    else if (kind === 'intent') {
      delete data.base['.changeset/initial.md']
    }
    else if (kind === 'retained-intent') {
      data.head['.changeset/initial.md'] = data.base['.changeset/initial.md']
    }
    else if (kind === 'invalid-kind') {
      data.base['.changeset/initial.md'] = data.base['.changeset/initial.md'].replace('minor', 'invalid')
    }
    else if (kind === 'wrong-version') {
      data.head['packages/new/CHANGELOG.md'] = data.head['packages/new/CHANGELOG.md'].replace('0.1.0', '0.2.0')
    }
    else {
      const file = '.changeset/ledger.yaml'
      data.head[file] = kind === 'ledger'
        ? data.head[file].replace(/"pkg-new@0\.1\.0":[\s\S]*$/, '')
        : data.head[file].replace(kind === 'wrong-dir' ? 'packages/new' : '[initial]', kind === 'wrong-dir' ? 'packages/other' : '[example]')
    }
    expect(isMetadata(data)).toBe(false)
  })

  it('首发也不能豁免源码修改或已有 ledger 的改写', () => {
    const source = initialReleaseFixture(true)
    source.head['packages/new/src/index.ts'] = 'export const changed = true\n'
    expect(isMetadata(source)).toBe(false)
    const history = initialReleaseFixture(true)
    history.head['.changeset/ledger.yaml'] = history.head['.changeset/ledger.yaml'].replace('[previous]', '[initial]')
    expect(isMetadata(history)).toBe(false)
  })

  it('混合升版不能用已有包的消费记录掩盖首发 intent 和 ledger 同时缺失', () => {
    const data = initialReleaseFixture(true)
    delete data.base['.changeset/initial.md']
    data.head['.changeset/ledger.yaml'] = data.head['.changeset/ledger.yaml'].replace(/"pkg-new@0\.1\.0":[\s\S]*$/, '')
    expect(isMetadata(data)).toBe(false)
  })
})
