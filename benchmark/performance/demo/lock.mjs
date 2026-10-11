import assert from 'node:assert/strict'

const fields = ['dependencies', 'devDependencies', 'optionalDependencies']

export function assertRegistryGraph(lock) {
  const visit = (value) => {
    if (typeof value === 'string') assert.ok(!/^(?:link:|workspace:|file:)/.test(value), `消费依赖包含本地协议：${value}`)
    else if (value && typeof value === 'object') Object.values(value).forEach(visit)
  }
  visit(lock)
  for (const entry of Object.values(lock.packages ?? {})) {
    assert.ok(entry.resolution?.integrity, '发布依赖缺少完整性信息')
  }
}

export function pruneLock(lock, importer) {
  const snapshots = {}
  const packages = {}
  const visit = (name, entry) => {
    const version = typeof entry === 'string' ? entry : entry.version
    if (/^(?:link:|workspace:|file:)/.test(version)) return
    const key = /^\d/.test(version) ? `${name}@${version}` : version
    if (snapshots[key] || !lock.snapshots[key]) return
    const snapshot = lock.snapshots[key]
    snapshots[key] = snapshot
    const packageKey = key.split('(')[0]
    if (lock.packages[packageKey]) packages[packageKey] = lock.packages[packageKey]
    for (const field of ['dependencies', 'optionalDependencies']) {
      for (const [dependency, resolved] of Object.entries(snapshot[field] ?? {})) visit(dependency, resolved)
    }
  }
  for (const field of fields) for (const [name, entry] of Object.entries(importer[field] ?? {})) visit(name, entry)
  const patchedDependencies = Object.fromEntries(Object.entries(lock.patchedDependencies ?? {}).filter(([key]) => packages[key]))
  return { lockfileVersion: lock.lockfileVersion, settings: lock.settings, ...(lock.pnpmfileChecksum ? { pnpmfileChecksum: lock.pnpmfileChecksum } : {}), ...(Object.keys(patchedDependencies).length ? { patchedDependencies } : {}), importers: { '.': importer }, packages, snapshots }
}
