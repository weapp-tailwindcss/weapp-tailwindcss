import assert from 'node:assert/strict'

export const baselineRef = '0e9ceb82321d49d145bf63c4adf84c7a8639e0e9'
export const projectRelative = 'demo/taro-webpack-react-tailwindcss-v4'
export const compilerVersions = { current: '5.91.0', previous: '5.105.4' }

const stable = value => JSON.stringify(value, Object.keys(value ?? {}).sort())
export const withoutPeers = value => value.split('(')[0]

function packageId(name, reference) {
  if (/^(?:link:|file:|workspace:)/.test(reference)) return undefined
  return reference.startsWith(`${name}@`) ? withoutPeers(reference) : `${name}@${withoutPeers(reference)}`
}

function referenceKey(name, reference) {
  return reference.startsWith(`${name}@`) ? reference : `${name}@${reference}`
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

function normalizedSnapshots(lock, ignoreIds = new Set()) {
  const result = new Map()
  for (const [key, value] of Object.entries(lock.snapshots)) {
    const id = withoutPeers(key)
    if (ignoreIds.has(id)) continue
    const edges = {}
    for (const field of ['dependencies', 'optionalDependencies']) {
      for (const [name, reference] of Object.entries(value[field] ?? {})) {
        const child = packageId(name, reference)
        if (!ignoreIds.has(child)) edges[`${field}:${name}`] = child ?? reference
      }
    }
    const signatures = result.get(id) ?? new Set()
    signatures.add(stable(edges))
    result.set(id, signatures)
  }
  return Object.fromEntries([...result].sort().map(([key, signatures]) => [key, [...signatures].sort()]))
}

export function auditLockAxis(current, previous, accurateBaseline) {
  const left = compilerSnapshot(current, compilerVersions.current)
  const right = compilerSnapshot(previous, compilerVersions.previous)
  const expected = previousCompanions(accurateBaseline)
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
  for (const id of new Set([...Object.keys(current.packages), ...Object.keys(previous.packages)])) {
    const a = current.packages[id]
    const b = previous.packages[id]
    if (JSON.stringify(a) === JSON.stringify(b)) continue
    assert.ok(allowed.has(withoutPeers(id)), `非编译器依赖发生漂移：${id}`)
    packageChanges.push({ id, current: a ?? null, previous: b ?? null })
  }
  assert.deepEqual(normalizedSnapshots(current, allowed), normalizedSnapshots(previous, allowed), '非编译器依赖边发生漂移')
  const normalizeImporters = lock => Object.fromEntries(Object.entries(lock.importers).map(([key, value]) => [key,
    Object.fromEntries(Object.entries(value).map(([field, entries]) => [field,
      ['dependencies', 'devDependencies', 'optionalDependencies'].includes(field)
        ? Object.fromEntries(Object.entries(entries).map(([name, entry]) => [name, {
            ...entry,
            version: allowed.has(packageId(name, entry.version)) ? '<compiler-axis>' : withoutPeers(entry.version),
          }]))
        : entries,
    ])),
  ]))
  assert.deepEqual(normalizeImporters(current), normalizeImporters(previous), '非编译器 importer 发生漂移')
  assert.deepEqual(current.catalogs, previous.catalogs, 'catalog 不允许变化')
  const peerKeyChanges = {
    removed: Object.keys(current.snapshots).filter(key => !previous.snapshots[key]),
    added: Object.keys(previous.snapshots).filter(key => !current.snapshots[key]),
  }
  return { companionChanges, allowedPackageIdentities: [...allowed].sort(), packageChanges, peerKeyChanges }
}
