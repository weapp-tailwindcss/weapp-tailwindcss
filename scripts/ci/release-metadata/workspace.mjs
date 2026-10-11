import path from 'node:path'
import { isDeepStrictEqual } from 'node:util'

function record(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
}

export function readWorkspace(snapshot, yaml) {
  const config = yaml.parse(snapshot.read('pnpm-workspace.yaml'))
  if (!record(config) || !Array.isArray(config.packages) || config.packages.some(pattern => typeof pattern !== 'string')) {
    throw new Error('workspace 包注册配置无效')
  }
  const includes = config.packages.filter(pattern => !pattern.startsWith('!'))
  const excludes = config.packages.filter(pattern => pattern.startsWith('!')).map(pattern => pattern.slice(1))
  const manifests = new Map()
  const names = new Map()
  for (const file of snapshot.paths.filter(file => path.posix.basename(file) === 'package.json')) {
    const dir = path.posix.dirname(file)
    const registered = file === 'package.json' || (includes.some(pattern => path.posix.matchesGlob(dir, pattern))
      && !excludes.some(pattern => path.posix.matchesGlob(dir, pattern)))
    if (!registered) {
      continue
    }
    const data = JSON.parse(snapshot.read(file))
    if (!record(data) || typeof data.name !== 'string' || names.has(data.name)) {
      throw new Error(`workspace 包身份无效：${file}`)
    }
    const item = { file, dir, data }
    manifests.set(file, item)
    names.set(data.name, item)
  }
  return { config, manifests, names }
}

export function readVersionChanges(changes, base, head, semver) {
  const updates = new Map()
  for (const { file, status } of changes.filter(change => path.posix.basename(change.file) === 'package.json')) {
    const previous = base.manifests.get(file)
    const next = head.manifests.get(file)
    if (status !== 'M' || !previous || !next) {
      throw new Error(`版本变更不属于已注册的现有包：${file}`)
    }
    const { version: oldVersion, ...oldData } = previous.data
    const { version: newVersion, ...newData } = next.data
    if (!isDeepStrictEqual(oldData, newData) || semver.valid(oldVersion) !== oldVersion || semver.valid(newVersion) !== newVersion || !semver.gt(newVersion, oldVersion)) {
      throw new Error(`manifest 不是单纯合法版本提升：${file}`)
    }
    updates.set(next.data.name, { ...next, oldVersion, newVersion })
  }
  if (updates.size === 0) {
    throw new Error('没有版本提升')
  }
  return updates
}

export function validateFixedGroups(workspace, updates) {
  const groups = workspace.config.versioning?.fixed || []
  if (!Array.isArray(groups) || groups.some(group => !Array.isArray(group) || group.some(name => typeof name !== 'string'))) {
    throw new Error('fixed group 配置无效')
  }
  for (const group of groups) {
    if (group.some(pattern => ![...workspace.names.keys()].some(name => path.posix.matchesGlob(name, pattern)))) {
      throw new Error('fixed group 引用了未注册的包')
    }
    const members = [...workspace.names.keys()].filter(name => group.some(pattern => path.posix.matchesGlob(name, pattern)))
    const changed = members.filter(name => updates.has(name))
    if (changed.length && (changed.length !== members.length || new Set(changed.map(name => updates.get(name).newVersion)).size !== 1)) {
      throw new Error('fixed group 必须同步到同一版本')
    }
  }
}

function workspaceTarget(name, specifier, owner, workspace) {
  const value = specifier.slice('workspace:'.length)
  if (value.startsWith('.')) {
    const dir = path.posix.normalize(path.posix.join(owner.dir, value))
    return { target: [...workspace.manifests.values()].find(item => item.dir === dir), range: '*' }
  }
  const alias = value.lastIndexOf('@')
  return alias > 0
    ? { target: workspace.names.get(value.slice(0, alias)), range: value.slice(alias + 1) }
    : { target: workspace.names.get(name), range: value }
}

export function validateWorkspaceProtocols(workspace, semver) {
  for (const owner of workspace.manifests.values()) {
    for (const field of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
      for (const [name, specifier] of Object.entries(owner.data[field] || {})) {
        if (typeof specifier !== 'string' || !specifier.startsWith('workspace:')) {
          continue
        }
        const { target, range } = workspaceTarget(name, specifier, owner, workspace)
        if (!target || !semver.valid(target.data.version) || (!['*', '^', '~'].includes(range) && (!semver.validRange(range) || !semver.satisfies(target.data.version, range)))) {
          throw new Error(`workspace 协议无法满足：${owner.data.name} → ${name}`)
        }
      }
    }
  }
}
