import path from 'node:path'
import { describe, it } from 'vitest'
import { webCases } from './hbuilderx-local/cases'
import { withIssue1144Setup } from './hbuilderx-local/issue-1144-source'
import { verifyWebHmr } from './hbuilderx-local/runner'

const run = process.env['E2E_ISSUE_1144_STABLE'] === '1' ? describe : describe.skip

run('issue #1144 HBuilderX stable SFC lifecycle', () => {
  it.each(['options', 'setup'])('keeps %s lifecycle and pt consumer current across 16 saves and refreshes', async (mode) => {
    if (process.env['HBUILDERX_CHANNEL'] !== 'stable') {
      throw new Error('此回归必须显式使用 HBUILDERX_CHANNEL=stable')
    }
    const item = webCases.find(item => item.name === 'issue-1144-uni-app-x-web')!
    const projectRoot = path.resolve(__dirname, '..', item.projectDir)
    if (mode === 'setup') {
      await withIssue1144Setup(projectRoot, () => verifyWebHmr(item))
    }
    else {
      await verifyWebHmr(item)
    }
  }, 360_000)
})
