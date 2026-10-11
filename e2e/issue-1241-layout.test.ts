import { expect, it } from 'vitest'
import { setLayout } from './issue-1241/layout'
import { build, createProject, evidence } from './issue-1241/project'

it.each([1, 2, 3, 8])('双入口尺寸探针 %s rpx 的 static 基线', async (base) => {
  const project = await createProject(`layout-static-${base}`, { secondTheme: `${base}rpx` })
  await setLayout(project, base, 'dual-source-layout-static')
  await build(project)
  const { declarations, wxml } = await evidence(project)
  expect(declarations['.w-32']).toEqual([`${base * 32}rpx`])
  expect(declarations['.mt-4']).toEqual([`${base * 4}rpx`])
  expect(declarations['.-mt-4']).toEqual([`${-base * 4}rpx`])
  await expect(JSON.stringify({ declarations, wxml }, null, 2)).toMatchFileSnapshot(`./__snapshots__/issue-1241/layout-${base}.json`)
})
