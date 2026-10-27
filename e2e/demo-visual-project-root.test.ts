import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { isMiniProgramOutputInside, readMiniProgramProject, resolveMiniProgramProjectRoots, resolveMiniProgramWatchProject } from '../scripts/demo-visual-e2e-report/mini-program-project'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => fs.rm(root, { recursive: true, force: true })))
})

describe('visual mini-program project paths', () => {
  it.each([
    { paths: path.posix, projectPath: '/projects/demo', configuredRoot: './output/mini', root: '/projects/demo/output/mini', output: '/projects/demo/output/mini/page.wxml', outside: '/projects/demo/output/mini-copy/page.wxml' },
    { paths: path.win32, projectPath: String.raw`C:\projects\demo`, configuredRoot: String.raw`.\output\mini`, root: String.raw`C:\projects\demo\output\mini`, output: String.raw`C:\projects\demo\output\mini\page.wxml`, outside: String.raw`D:\projects\demo\output\mini\page.wxml` },
    { paths: path.win32, projectPath: 'C:/projects/demo', configuredRoot: './output/mini', root: String.raw`C:\projects\demo\output\mini`, output: 'C:/projects/demo/output/mini/page.wxml', outside: 'C:/projects/demo/output/mini-copy/page.wxml' },
    { paths: path.posix, projectPath: '/', configuredRoot: undefined, root: '/', output: '/page.wxml', outside: undefined },
    { paths: path.win32, projectPath: 'C:\\', configuredRoot: '.', root: 'C:\\', output: 'C:\\page.wxml', outside: 'D:\\page.wxml' },
    { paths: path.posix, projectPath: './project', configuredRoot: './output', root: path.posix.resolve('./project/output'), output: './project/output/page.wxml', outside: './project/page.wxml' },
  ])('resolves and confines outputs with $projectPath', ({ paths, projectPath, configuredRoot, root, output, outside }) => {
    const project = resolveMiniProgramProjectRoots(projectPath, configuredRoot, paths)
    expect(project.miniprogramRoot).toBe(root)
    expect(isMiniProgramOutputInside(project, output, paths)).toBe(true)
    expect(isMiniProgramOutputInside(project, paths.join(root, '..legal', 'page.wxml'), paths)).toBe(true)
    if (outside) {
      expect(isMiniProgramOutputInside(project, outside, paths)).toBe(false)
    }
  })

  async function fixture() {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'visual-project-roots-'))
    roots.push(root)
    const outputRoot = path.join(root, 'generated')
    await fs.mkdir(outputRoot)
    return { root, outputRoot, output: path.join(outputRoot, 'page.wxml') }
  }

  it('does not accept a stale runtime root even when project or source roots contain the output', async () => {
    const { root, outputRoot, output } = await fixture()
    await fs.writeFile(path.join(root, 'project.config.json'), JSON.stringify({ miniprogramRoot: './previous', srcMiniprogramRoot: './generated' }))
    await fs.writeFile(path.join(outputRoot, 'project.config.json'), '{}')
    expect(await resolveMiniProgramWatchProject(output, [root])).toEqual({ projectPath: outputRoot, miniprogramRoot: outputRoot })
    await fs.rm(path.join(outputRoot, 'project.config.json'))
    await expect(resolveMiniProgramWatchProject(output, [root])).rejects.toThrow('No project.config.json miniprogramRoot covers watch output')
  })

  it('uses an explicit root outside the IDE directory and rejects invalid root values', async () => {
    const { root, outputRoot, output } = await fixture()
    const projectPath = path.join(root, 'ide')
    await fs.mkdir(projectPath)
    const configFile = path.join(projectPath, 'project.config.json')
    await fs.writeFile(configFile, JSON.stringify({ miniprogramRoot: '../generated' }))
    expect(await resolveMiniProgramWatchProject(output, [projectPath])).toEqual({ projectPath, miniprogramRoot: outputRoot })
    await fs.writeFile(configFile, JSON.stringify({ miniprogramRoot: null }))
    await expect(readMiniProgramProject(projectPath)).rejects.toThrow('Invalid miniprogramRoot')
  })
})
