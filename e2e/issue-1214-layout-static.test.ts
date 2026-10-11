import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { expect, it } from 'vitest'
import { createLayoutProject } from './issue-1214/ide-project'
import { buildProject, readOutput, readProbeDeclarations } from './issue-1214/project'

it('Issue #1214 尺寸对照页的真实 uni-app WXSS 基线', async () => {
  const project = await createLayoutProject('issue-1214-static-layout')
  try {
    await buildProject(project)
    const { css, wxml } = await readOutput(project)
    expect(wxml).toContain('issue-1214-static-layout')
    expect(wxml).toContain('reference-gap-second')
    expect(wxml).toContain('padding:32rpx')
    expect(wxml).toContain('margin-top:-32rpx')
    const declarations = readProbeDeclarations(css)
    expect(declarations).toEqual({ '.w-32': ['256rpx'], '.h-32': ['256rpx'], '.p-4': ['32rpx'], '.-mt-4': ['-32rpx'], '.gap-4': ['32rpx'] })
    expect(JSON.parse(await readFile(path.join(project.output, 'app.json'), 'utf8')).pages).toContain('pages/index')
    expect(JSON.parse(await readFile(path.join(project.output, 'project.config.json'), 'utf8')).appid).toMatch(/^wx[\da-f]{16}$/i)
    const evidence = { declarations, wxml }
    await expect(`${JSON.stringify(evidence, null, 2)}\n`).toMatchFileSnapshot('__snapshots__/issue-1214/ide-layout.json')
  }
  finally {
    await project.close()
  }
}, 150_000)
