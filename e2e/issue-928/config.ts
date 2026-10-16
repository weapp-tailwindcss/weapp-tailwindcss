import path from 'node:path'
import process from 'node:process'

export const issue928PageUrl = '/pages/issue-928/index'
export const timeoutMs = Number(process.env['E2E_IDE_ISSUE_909_TIMEOUT_MS'] ?? process.env['E2E_AUTOMATOR_TIMEOUT_MS'] ?? 90_000)
export const artifactDir = path.resolve(import.meta.dirname, '../.artifacts/issue-909')
export const issue928BaselineDir = path.resolve(import.meta.dirname, '../fixtures/issue-928-baselines')
export const issue928CompareBaselinePaths = {
  1: path.resolve(issue928BaselineDir, 'v4-compare-1x.png'),
  2: path.resolve(issue928BaselineDir, 'v4-compare.png'),
} as const
export const shouldUpdateIssue928CompareBaseline = process.env['E2E_UPDATE_ISSUE_928_BASELINE'] === '1'
