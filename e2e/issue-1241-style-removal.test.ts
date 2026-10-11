import { writeFile } from 'node:fs/promises'
import { expect, it } from 'vitest'
import { build, createProject, evidence } from './issue-1241/project'
import { styleRemovalPage } from './issue-1241/style-removal'

it.each(['initial', 'removed', 'empty'] as const)('整块样式删除对照页 static：%s', async (phase) => {
  const project = await createProject(`style-removal-${phase}`, { spacing: '2rpx' })
  await writeFile(project.pageFile, styleRemovalPage('style-removal-static', phase))
  await build(project)
  const result = await evidence(project)
  expect(result.declarations['.w-32']).toEqual([phase === 'initial' ? 'calc(var(--spacing)*32)' : '64rpx'])
  expect(result.css.includes('--spacing:3rpx')).toBe(phase === 'initial')
  await expect(JSON.stringify({ declarations: result.declarations, wxml: result.wxml }, null, 2))
    .toMatchFileSnapshot(`./__snapshots__/issue-1241/style-removal-${phase}.json`)
})
