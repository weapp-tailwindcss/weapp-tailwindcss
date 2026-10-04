import assert from 'node:assert/strict'
import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { kernelRoots, metadataFile, repositoryRoot, verifyBinding, verifyDistribution } from './distribution.mjs'
import { bindingFileName, nativeTargets } from './targets.mjs'

const readJson = file => JSON.parse(readFileSync(file, 'utf8'))
const writeJson = (file, value) => writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`)
const statePath = roots => join(roots.core, 'bindings', 'release-version-state.json')

function artifactRecords(roots, repoRoot) {
  return Object.entries(nativeTargets).flatMap(([target, { suffix }]) => Object.entries(roots).map(([kernel, root]) => ({
    target,
    kernel,
    root,
    binding: join(root, 'bindings', bindingFileName(suffix, kernel)),
    stagedMetadata: join(repoRoot, 'packages-native', suffix, metadataFile(kernel)),
  })))
}

export function beforeNativeVersion(roots = kernelRoots, repoRoot = repositoryRoot) {
  // 版本修改前保存已验证证据，afterVersion 不接受任意旧产物直接重标。
  rmSync(statePath(roots), { force: true })
  verifyDistribution(roots, repoRoot)
  const versions = Object.fromEntries(Object.entries(roots).map(([kernel, root]) => [kernel, readJson(join(root, '..', 'package.json')).version]))
  const artifacts = artifactRecords(roots, repoRoot).map(({ target, kernel, root, binding, stagedMetadata }) => {
    const metadata = readJson(`${binding}.json`)
    verifyBinding(target, binding, metadata, root, kernel)
    assert.deepEqual(metadata, readJson(stagedMetadata), 'Downloaded and staged native metadata must agree')
    return { target, kernel, metadata }
  })
  writeJson(statePath(roots), { schema: 1, versions, artifacts })
}

export function afterNativeVersion(roots = kernelRoots, repoRoot = repositoryRoot) {
  const state = readJson(statePath(roots))
  assert.equal(state.schema, 1, 'Native version transition requires a verified beforeVersion state')
  const records = artifactRecords(roots, repoRoot)
  assert.equal(state.artifacts?.length, records.length, 'Native version transition requires every target and kernel')
  assert.deepEqual(Object.keys(state.versions).sort(), Object.keys(roots).sort())
  for (const version of Object.values(state.versions)) {
    assert.equal(typeof version, 'string')
    assert.ok(version.length > 0)
  }
  // 平台 manifest 必须匹配新 compiler 版本，产物必须仍匹配版本修改前的证据。
  verifyDistribution(roots, repoRoot, state.versions)
  const writes = records.flatMap(({ target, kernel, root, binding, stagedMetadata }, index) => {
    const previous = state.artifacts[index]
    assert.equal(previous.target, target)
    assert.equal(previous.kernel, kernel)
    const metadata = readJson(`${binding}.json`)
    assert.deepEqual(metadata, previous.metadata, 'Native metadata changed during versioning')
    assert.deepEqual(readJson(stagedMetadata), previous.metadata, 'Staged native metadata changed during versioning')
    verifyBinding(target, binding, metadata, root, kernel, state.versions[kernel])
    const updated = { ...metadata, version: readJson(join(root, '..', 'package.json')).version }
    return [[`${binding}.json`, updated], [stagedMetadata, updated]]
  })
  // 全部十六个产物通过后才写入；任何源码、二进制或元数据差异都会阻断发布。
  for (const [file, metadata] of writes) {
    writeJson(file, metadata)
  }
  verifyDistribution(roots, repoRoot)
  rmSync(statePath(roots))
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const phase = process.argv[2]
  assert.equal(process.env.npm_lifecycle_event, `native:artifacts:${phase}`, 'Native version transition must run through its repoctl lifecycle script')
  if (phase === 'before-version') {
    beforeNativeVersion()
  }
  else if (phase === 'after-version') {
    afterNativeVersion()
  }
  else {
    throw new Error('Usage: pnpm native:artifacts:before-version|native:artifacts:after-version')
  }
}
