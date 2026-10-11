import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { expect, it } from 'vitest'
import { build, createProject, evidence, multipliers, pageSource, themeSource } from './issue-1241/project'

it('默认计算识别独立页面样式中的主题覆盖', async () => {
  const project = await createProject('page-override', { secondTheme: '1rpx' })
  await writeFile(project.pageFile, `${pageSource(project.name)}\n<style>.scope{--spacing:3rpx}</style>`)
  await build(project)
  const result = await evidence(project)
  expect(Object.keys(result.declarations).sort()).toEqual(Object.keys(multipliers).sort())
  for (const [selector, multiple] of Object.entries(multipliers)) {
    expect(result.declarations[selector]).toEqual([`calc(var(--spacing)*${multiple})`])
  }
  await expect(JSON.stringify(result.declarations, null, 2)).toMatchFileSnapshot('./__snapshots__/issue-1241/page-override.json')
})

it.each([
  ['same-theme', { secondTheme: '1rpx' }, false],
  ['conflict', { secondTheme: '2rpx' }, true],
  ['author', { secondTheme: '1rpx', author: '.scope {--spacing:3rpx}' }, true],
  ['single', {}, false],
] as const)('Issue 1241 完整构建 %s', async (name, options, dynamic) => {
  const project = await createProject(name, options)
  await build(project)
  const result = await evidence(project)
  expect(result.wxml).toContain(project.name)
  expect(Object.keys(result.declarations).sort()).toEqual(Object.keys(multipliers).sort())
  for (const [selector, multiple] of Object.entries(multipliers)) {
    expect(result.declarations[selector]).toEqual([dynamic ? `calc(var(--spacing)*${multiple})` : `${multiple}rpx`])
  }
  expect(result.css).not.toContain('deferred-source:')
  await expect(JSON.stringify(result.declarations, null, 2)).toMatchFileSnapshot(`./__snapshots__/issue-1241/${name}.json`)
})

it.each(['file', 'glob', 'inline', 'excluded', 'empty', 'both-empty', 'overlap'] as const)('Issue 1241 不同目录和独立 source 范围 %s', async (mode) => {
  const project = await createProject(`scope-${mode}`, { secondTheme: '1rpx' })
  const nested = path.join(project.root, 'src', 'nested')
  await mkdir(nested)
  await writeFile(project.pageFile, pageSource(project.name, 'w-32 h-32'))
  if (mode === 'both-empty') {
    await writeFile(project.themeFile, themeSource().replace('@source \'./pages/index.vue\';', ''))
  }
  await writeFile(path.join(nested, 'allowed.vue'), pageSource('allowed', 'p-4 gap-4'))
  await writeFile(path.join(nested, 'excluded.vue'), pageSource('excluded', 'mt-4'))
  const scan = mode === 'file'
    ? '@source \'./allowed.vue\';'
    : mode === 'glob'
      ? '@source \'./allowed*.vue\';'
      : mode === 'inline'
        ? '@source inline("p-4 gap-4");'
        : mode === 'excluded'
          ? '@source \'./*.vue\'; @source not \'./excluded.vue\';'
          : mode === 'overlap' ? '@source \'./allowed.vue\'; @source \'../pages/index.vue\';' : ''
  const second = `${themeSource().replace('@source \'./pages/index.vue\';', scan)}\n`
  await writeFile(path.join(nested, 'renamed.css'), second)
  const main = path.join(project.root, 'src', 'main.ts')
  await writeFile(main, project.main.replace('./second.css', './nested/renamed.css'))
  const config = path.join(project.root, 'vite.config.ts')
  await writeFile(config, (await readFile(config, 'utf8')).replace('./src/second.css', './src/nested/renamed.css'))
  await build(project)
  const result = await evidence(project)
  const expected = mode === 'both-empty' ? [] : mode === 'empty' ? ['.w-32', '.h-32'] : ['.w-32', '.h-32', '.p-4', '.gap-4']
  expect(Object.keys(result.declarations).sort()).toEqual(expected.sort())
  expect(result.css).not.toContain('deferred-source:')
  await expect(JSON.stringify(result.declarations, null, 2)).toMatchFileSnapshot(`./__snapshots__/issue-1241/scope-${mode}.json`)
})
