import assert from 'node:assert/strict'
import { isDeepStrictEqual } from 'node:util'
import { auditNonAxisGraph } from './lock-graph.mjs'

export const baselineRef = '0e9ceb82321d49d145bf63c4adf84c7a8639e0e9'
export const projectRelative = 'demo/taro-webpack-react-tailwindcss-v4'
export const compilerVersions = { current: '5.91.0', previous: '5.105.4' }
export const compilerParents = ['@tarojs/webpack5-runner@4.3.1', '@tarojs/taro-loader@4.3.1', '@tarojs/webpack5-prebundle@4.3.1']

export function compilerOverrides(companions) {
  return Object.fromEntries([
    ...compilerParents.map(id => [`${id}>webpack`, compilerVersions.previous]),
    ...Object.entries(companions).map(([name, version]) => [`webpack@${compilerVersions.previous}>${name}`, version]),
  ])
}

function exactCompilerPeerChange(id, current, previous) {
  if (!compilerParents.includes(id) || current?.peerDependencies?.webpack !== compilerVersions.current || previous?.peerDependencies?.webpack !== compilerVersions.previous) return false
  const expected = { ...current, peerDependencies: { ...current.peerDependencies, webpack: compilerVersions.previous } }
  return isDeepStrictEqual(expected, previous)
}

export const withoutPeers = value => value.split('(')[0]
const patchHash = value => value.match(/^[^(]+\(patch_hash=([^()]+)\)/)?.[1]

function packageId(name, reference) {
  if (/^(?:link:|file:|workspace:)/.test(reference)) return undefined
  return reference.startsWith(`${name}@`) ? withoutPeers(reference) : `${name}@${withoutPeers(reference)}`
}

function referenceKey(name, reference) {
  return reference.startsWith(`${name}@`) ? reference : `${name}@${reference}`
}

function auditPatches(lock) {
  for (const key of Object.keys(lock.snapshots)) {
    const expected = lock.patchedDependencies?.[withoutPeers(key)]
    const hash = typeof expected === 'string' ? expected : expected?.hash
    assert.equal(patchHash(key), hash, `snapshot 补丁身份与声明不符：${key}`)
  }
}

function auditMetadata(current, previous, accurateBaseline, companions) {
  const other = lock => Object.fromEntries(Object.entries(lock).filter(([key]) => ![
    'packages', 'snapshots', 'importers', 'catalogs', 'overrides', 'patchedDependencies',
  ].includes(key)))
  assert.deepEqual(other(current), other(previous), '非编译器锁 metadata 发生漂移')
  const overrides = { ...current.overrides, ...compilerOverrides(companions) }
  assert.deepEqual(previous.overrides, overrides, 'override 只能包含明确的编译器配套切换')
  const previousKey = `webpack@${compilerVersions.previous}`
  const baselinePatch = accurateBaseline.patchedDependencies?.[previousKey]
  assert.ok(baselinePatch, '准确基线缺少旧编译器补丁身份')
  const patches = { ...current.patchedDependencies, [previousKey]: baselinePatch }
  assert.deepEqual(previous.patchedDependencies, patches, '非编译器补丁身份发生漂移')
  auditPatches(current)
  auditPatches(previous)
}

export function compilerSnapshot(lock, version) {
  const reference = lock.importers[projectRelative].devDependencies.webpack.version
  assert.equal(withoutPeers(reference), version, 'demo 必须实际解析指定的 Webpack')
  const key = referenceKey('webpack', reference)
  assert.ok(lock.snapshots[key], `缺少准确 Webpack snapshot：${key}`)
  return { key, snapshot: lock.snapshots[key] }
}

function closure(lock, keys) {
  const visited = new Set()
  const identities = new Set()
  const pending = [...keys]
  while (pending.length) {
    const key = pending.pop()
    if (visited.has(key)) continue
    visited.add(key)
    const snapshot = lock.snapshots[key]
    assert.ok(snapshot, `编译器闭包 snapshot 缺失：${key}`)
    identities.add(withoutPeers(key))
    for (const [name, ref] of Object.entries({ ...snapshot.dependencies, ...snapshot.optionalDependencies })) {
      if (packageId(name, ref)) pending.push(referenceKey(name, ref))
    }
  }
  return identities
}

export function previousCompanions(lock) {
  const { snapshot } = compilerSnapshot(lock, compilerVersions.previous)
  return Object.fromEntries(Object.entries(snapshot.dependencies).map(([name, reference]) => [name, withoutPeers(reference)]))
}

export function auditLockAxis(current, previous, accurateBaseline) {
  const left = compilerSnapshot(current, compilerVersions.current)
  const right = compilerSnapshot(previous, compilerVersions.previous)
  const expected = previousCompanions(accurateBaseline)
  auditMetadata(current, previous, accurateBaseline, expected)
  const actual = Object.fromEntries(Object.entries(right.snapshot.dependencies).map(([name, ref]) => [name, withoutPeers(ref)]))
  assert.deepEqual(actual, expected, '旧编译器直接配套必须与准确 base0e9 一致')
  const allowed = new Set([withoutPeers(left.key), withoutPeers(right.key)])
  const companionChanges = []
  for (const name of new Set([...Object.keys(left.snapshot.dependencies), ...Object.keys(right.snapshot.dependencies)])) {
    const a = left.snapshot.dependencies[name]
    const b = right.snapshot.dependencies[name]
    if (withoutPeers(a ?? '') === withoutPeers(b ?? '')) continue
    companionChanges.push({ name, current: a && withoutPeers(a), previous: b && withoutPeers(b) })
    for (const [lock, ref] of [[current, a], [previous, b]]) {
      if (ref) for (const id of closure(lock, [referenceKey(name, ref)])) allowed.add(id)
    }
  }
  const packageChanges = []
  const compilerPeerChanges = []
  for (const id of new Set([...Object.keys(current.packages), ...Object.keys(previous.packages)])) {
    const a = current.packages[id]
    const b = previous.packages[id]
    if (isDeepStrictEqual(a, b)) continue
    if (exactCompilerPeerChange(id, a, b)) {
      compilerPeerChanges.push({ id, current: a.peerDependencies.webpack, previous: b.peerDependencies.webpack })
      continue
    }
    assert.ok(allowed.has(withoutPeers(id)), `非编译器依赖发生漂移：${id}`)
    packageChanges.push({ id, current: a ?? null, previous: b ?? null })
  }
  auditNonAxisGraph(current, previous, allowed, { projectRelative, versions: compilerVersions })
  assert.deepEqual(current.catalogs, previous.catalogs, 'catalog 不允许变化')
  const peerKeyChanges = {
    removed: Object.keys(current.snapshots).filter(key => !previous.snapshots[key]),
    added: Object.keys(previous.snapshots).filter(key => !current.snapshots[key]),
  }
  return { companionChanges, allowedPackageIdentities: [...allowed].sort(), packageChanges, compilerPeerChanges, peerKeyChanges }
}
