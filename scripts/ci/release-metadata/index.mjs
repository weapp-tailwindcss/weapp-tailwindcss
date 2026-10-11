import path from 'node:path'
import { loadDependencies } from './dependencies.mjs'
import { readConsumedIntents, validateChangelogs, validateLedger } from './documents.mjs'
import { readInitialReleases, readVersionChanges, readWorkspace, validateFixedGroups, validateWorkspaceProtocols } from './workspace.mjs'

export function classifyReleaseMetadata({ changes, base, head, dependencies = loadDependencies() }) {
  if (!changes.length || changes.some(({ file, status }) => !['A', 'M', 'D'].includes(status)
    || !(path.posix.basename(file) === 'package.json' || path.posix.basename(file) === 'CHANGELOG.md'
      || file === '.changeset/ledger.yaml' || /^\.changeset\/[^/]+\.md$/.test(file)))) {
    return false
  }
  const oldWorkspace = readWorkspace(base, dependencies.yaml)
  const newWorkspace = readWorkspace(head, dependencies.yaml)
  const updates = new Map([
    ...readVersionChanges(changes, oldWorkspace, newWorkspace, dependencies.semver),
    ...readInitialReleases(changes, base, oldWorkspace, newWorkspace, dependencies),
  ])
  if (updates.size === 0) {
    throw new Error('没有版本提升或首发')
  }
  validateFixedGroups(newWorkspace, updates)
  validateWorkspaceProtocols(newWorkspace, dependencies.semver)
  validateChangelogs(changes, base, head, updates)
  const intents = readConsumedIntents(changes, base, head, updates, dependencies)
  validateLedger(changes, base, head, updates, intents, dependencies.yaml)
  return true
}
