import assert from 'node:assert/strict'
import { parseAllDocuments } from 'yaml'
import { projectRelative } from './lock-axis.mjs'

/** pnpm 工具链和 workspace 锁可能分为独立 YAML document，不能领取第一段的 importer。 */
export function parseLockDocuments(source) {
  const documents = parseAllDocuments(source)
  assert.ok(documents.length && documents.every(document => document.errors.length === 0), '锁文件 YAML 无效')
  const values = documents.map(document => document.toJS())
  assert.ok(values.every(value => value && typeof value === 'object' && !Array.isArray(value)), '锁文件 document 必须为对象')
  const workspaces = values.filter(value => Object.hasOwn(value.importers ?? {}, projectRelative))
  assert.equal(workspaces.length, 1, '锁文件必须只有一段包含目标 demo 的 workspace document')
  const lock = workspaces[0]
  assert.ok(lock.packages && lock.snapshots, 'workspace 锁缺少 packages 或 snapshots')
  return { lock, auxiliaryDocuments: values.filter(value => value !== lock) }
}

export function auditLockDocuments(current, previous) {
  assert.deepEqual(current.auxiliaryDocuments, previous.auxiliaryDocuments, '工具链等非 workspace 锁 document 发生漂移')
  return { current: current.lock, previous: previous.lock }
}
