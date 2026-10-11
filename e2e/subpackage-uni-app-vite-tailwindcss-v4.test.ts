import type { ProjectEntry } from './shared'
import fs from 'node:fs/promises'
import path from 'node:path'
import postcss from 'postcss'
import { expect, it } from 'vitest'
import { defineProjectTest, ensureProjectBuilt } from './projectTest'

const project = {
  name: 'subpackage-uni-app-vite-tailwindcss-v4',
  projectPath: 'subpackage-uni-app-vite-tailwindcss-v4/dist/build/mp-weixin',
  cssFile: 'main.wxss',
  cssFiles: [
    'main.wxss',
    'sub-normal/index.wxss',
    'sub-normal/pages/index.wxss',
    'sub-independent/index.wxss',
    'sub-independent/pages/index.wxss',
  ],
} satisfies ProjectEntry

defineProjectTest(project, {
  suite: 'e2e',
  fixturesDir: '../demo',
})

it('保留 uni-app runtime 的原始单位和用户变量', async () => {
  await ensureProjectBuilt(path.resolve(__dirname, '../demo', project.name))
  const css = postcss.parse(await fs.readFile(path.resolve(__dirname, '../demo', project.projectPath, project.cssFile), 'utf8'))
  for (const [property, value] of [
    ['--test-color', '#006241'],
    ['--status-bar-height', '25px'],
    ['--top-window-height', '0px'],
    ['--window-top', '0px'],
    ['--window-bottom', '0px'],
    ['--window-left', '0px'],
    ['--window-right', '0px'],
  ]) {
    const values: string[] = []
    css.walkDecls(property, (declaration) => {
      values.push(declaration.value)
    })
    expect(values, property).toEqual([value])
  }
})
