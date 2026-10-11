import assert from 'node:assert/strict'

function snapshotIdentity(lock, changes, replaced) {
  assert.ok(lock.snapshots && typeof lock.snapshots === 'object', '缺少依赖解析关系')
  const versions = new Map(changes.map(change => [change.name, new Set([change.before, change.after].filter(Boolean))]))
  // 这里处理 pnpm 逻辑依赖 ID，非文件系统路径。
  const normalize = (value) => {
    let result = value.replaceAll(/file:[^()]+/g, 'file:source-tarball')
    for (const [name, values] of versions) {
      for (const version of values) {
        result = result.replaceAll(`(${name}@${version})`, `(${name}@experiment)`)
      }
    }
    return result
  }
  const result = {}
  for (const [key, value] of Object.entries(lock.snapshots)) {
    if (replaced.has(key.split('(')[0])) {
      continue
    }
    const normalized = normalize(key)
    assert.ok(!Object.hasOwn(result, normalized), '规范化后的依赖身份重复')
    const snapshot = structuredClone(value)
    for (const field of ['dependencies', 'optionalDependencies']) {
      if (!snapshot[field]) {
        continue
      }
      snapshot[field] = Object.fromEntries(Object.entries(snapshot[field]).filter(([name, reference]) => !versions.get(name)?.has(reference.split('(')[0])).map(([name, reference]) => [name, normalize(reference)]))
      if (!Object.keys(snapshot[field]).length) {
        delete snapshot[field]
      }
    }
    result[normalized] = snapshot
  }
  return result
}

// 仅源码 tarball 和显式实验依赖可变化，其他版本、完整性与解析关系必须固定。
export function assertSameRegistryDependencies(before, after, changes = []) {
  const allowedRemoved = new Set()
  const allowedAdded = new Set()
  for (const change of changes) {
    assert.ok(typeof change.name === 'string' && change.name.length && !change.name.includes('*'), '依赖变更必须指定确切包名')
    assert.ok(change.before !== change.after && (change.before || change.after), '依赖变更必须指定不同版本或移除')
    for (const version of [change.before, change.after]) {
      assert.ok(version === null || /^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(version), '依赖变更必须指定确切版本或 null')
    }
    if (change.before) {
      allowedRemoved.add(`${change.name}@${change.before}`)
    }
    if (change.after) {
      allowedAdded.add(`${change.name}@${change.after}`)
    }
  }
  const external = lock => Object.fromEntries(Object.entries(lock.packages).filter(([key]) => !key.includes('@file:')).sort(([a], [b]) => a.localeCompare(b)))
  const evidence = {}
  for (const mode of ['native', 'static', 'enabled']) {
    const previous = external(before[mode])
    const current = external(after[mode])
    evidence[mode] = []
    for (const key of new Set([...Object.keys(previous), ...Object.keys(current)])) {
      if (!current[key] && allowedRemoved.has(key)) {
        evidence[mode].push({ key, before: previous[key], after: null })
        delete previous[key]
      }
      else if (!previous[key] && allowedAdded.has(key)) {
        evidence[mode].push({ key, before: null, after: current[key] })
        delete current[key]
      }
    }
    // 已存在版本的完整性不能借升级声明放行；其他依赖仍逐项相等。
    assert.deepEqual(current, previous, `${mode} 的外部依赖图发生变化，不能计算源码收益`)
    const replaced = new Set(evidence[mode].map(change => change.key))
    assert.deepEqual(snapshotIdentity(after[mode], changes, replaced), snapshotIdentity(before[mode], changes, replaced), `${mode} 的依赖解析关系发生未声明变化`)
  }
  return evidence
}
