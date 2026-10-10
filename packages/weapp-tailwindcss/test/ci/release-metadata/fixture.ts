import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { classifyReleaseMetadata } from '../../../../../scripts/ci/release-metadata/index.mjs'

export type Files = Record<string, string>

export function json(value: unknown) {
  return `${JSON.stringify(value, null, 2)}\n`
}

export function fixture() {
  const base: Files = {
    'package.json': json({ name: 'root', private: true, version: '0.0.0' }),
    'pnpm-workspace.yaml': 'packages:\n  - packages/*\n',
    'packages/a/package.json': json({ name: 'pkg-a', version: '1.0.0' }),
    'packages/a/CHANGELOG.md': '# pkg-a\n\n## 1.0.0\n\n已有记录。\n',
    '.changeset/example.md': '---\n"pkg-a": patch\n---\n\n中文变更说明。\n',
    '.changeset/ledger.yaml': '"pkg-a@1.0.0":\n  dir: packages/a\n  intents: [previous]\n',
  }
  const head: Files = {
    ...base,
    'packages/a/package.json': json({ name: 'pkg-a', version: '1.0.1' }),
    'packages/a/CHANGELOG.md': '# pkg-a\n\n## 1.0.1\n\n### Patch Changes\n\n中文版本记录。\n\n## 1.0.0\n\n已有记录。\n',
    '.changeset/ledger.yaml': `${base['.changeset/ledger.yaml']}"pkg-a@1.0.1":\n  dir: packages/a\n  intents: [example]\n`,
  }
  delete head['.changeset/example.md']
  return { base, head }
}

export function snapshot(files: Files) {
  return { paths: Object.keys(files), read: (file: string) => files[file] ?? null }
}

export function changes(base: Files, head: Files) {
  return [...new Set([...Object.keys(base), ...Object.keys(head)])]
    .filter(file => base[file] !== head[file])
    .map(file => ({ file, status: base[file] === undefined ? 'A' : head[file] === undefined ? 'D' : 'M' }))
}

export function isMetadata({ base, head }: ReturnType<typeof fixture>) {
  try {
    return classifyReleaseMetadata({ changes: changes(base, head), base: snapshot(base), head: snapshot(head) })
  }
  catch {
    return false
  }
}

export function git(cwd: string, ...args: string[]) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
}

export function writeFiles(cwd: string, files: Files) {
  for (const [file, contents] of Object.entries(files)) {
    const target = path.resolve(cwd, file)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, contents)
  }
}

export function gitFixture() {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'release-scope-test-'))
  git(cwd, 'init', '--initial-branch=main')
  git(cwd, 'config', 'user.name', 'CI scope test')
  git(cwd, 'config', 'user.email', 'scope@example.test')
  const files = fixture()
  writeFiles(cwd, files.base)
  git(cwd, 'add', '.')
  git(cwd, 'commit', '-m', 'test: base')
  const before = git(cwd, 'rev-parse', 'HEAD')
  writeFiles(cwd, files.head)
  fs.rmSync(path.join(cwd, '.changeset', 'example.md'))
  git(cwd, 'add', '.')
  git(cwd, 'commit', '-m', 'test: versions')
  const after = git(cwd, 'rev-parse', 'HEAD')
  return { cwd, before, after }
}
