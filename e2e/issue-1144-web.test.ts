import path from 'node:path'
import { describe, it } from 'vitest'
import { webCases } from './hbuilderx-local/cases'
import { withIssue1144Setup } from './hbuilderx-local/issue-1144-source'
import { verifyWebHmr } from './hbuilderx-local/runner'

const run = process.env['E2E_ISSUE_1144_WEB'] === '1' ? describe : describe.skip

run('issue #1144 CLI Web runtime', () => {
  it.each(['options', 'setup'])('keeps %s lifecycle, pt and important styles current across saves and browser refresh', async (mode) => {
    const base = webCases.find(item => item.name === 'issue-1144-uni-app-x-web')!
    const item = { ...base, launchWithHBuilderX: false, nativeIdeVersionRequired: false, serverLogContains: [] }
    if (mode === 'setup') {
      await withIssue1144Setup(path.resolve(__dirname, '..', item.projectDir), () => verifyWebHmr(item))
    }
    else {
      await verifyWebHmr(item)
    }
  }, 360_000)
})
