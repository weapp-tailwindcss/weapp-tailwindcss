import fs from 'node:fs/promises'
import process from 'node:process'
import path from 'pathe'
import { describe, expect, it } from 'vitest'
import { replaceWxml } from '../packages/weapp-tailwindcss/src/wxml'
import { getE2EProject } from './projectEntries'
import { defineProjectTest, ensureProjectBuilt } from './projectTest'
import { defineTaroBareSelectorRegression } from './taroBareSelectorRegression'

const project = getE2EProject('weapp-vite-tailwindcss-v4')

defineProjectTest(project, {
  suite: 'e2e',
  fixturesDir: '../demo',
  allowExtractionFailure: true,
})

defineTaroBareSelectorRegression(project)

describe('e2e', () => {
  it('generates independent subpackage utilities only once across build phases', async () => {
    const projectBase = path.resolve(__dirname, '../demo')
    const root = path.resolve(projectBase, project.name)
    const projectPath = path.resolve(projectBase, project.projectPath)

    if (process.env.E2E_SKIP_BUILD !== '1') {
      await ensureProjectBuilt(root)
    }

    const css = await fs.readFile(path.resolve(projectPath, 'dist/sub-independent/pages/index.wxss'), 'utf8')
    const selector = replaceWxml('before:content-[\'independent_subpackage_weapp-vite-tailwindcss-v4\']')

    expect(css.split(`.${selector}::before`)).toHaveLength(2)
  })

  it('keeps non-class WXML expression strings unescaped in weapp-vite v4 output', async () => {
    const projectBase = path.resolve(__dirname, '../demo')
    const root = path.resolve(projectBase, project.name)
    const projectPath = path.resolve(projectBase, project.projectPath)

    if (process.env.E2E_SKIP_BUILD !== '1') {
      await ensureProjectBuilt(root)
    }

    const pageWxml = await fs.readFile(path.resolve(projectPath, 'dist/pages/index/index.wxml'), 'utf8')

    expect(pageWxml).toContain(replaceWxml('text-[55rpx]'))
    expect(pageWxml).toContain('Hello world!')
    expect(pageWxml).toContain('keep-[business]')
    expect(pageWxml).toContain('at App.vue:4')
    expect(pageWxml).toContain('at App.vue:4 index.ts:120:3')
    expect(pageWxml).toContain('size > 4 ? keep-[business] : App.vue:4')
    expect(pageWxml).toContain('before content [\\"not-generated\\"]')
    expect(pageWxml).toContain('before content [&quot;not-generated&quot;]')
    expect(pageWxml).toContain('https://example.com/a[b]?q=Hello world!')
    expect(pageWxml).not.toContain('Hello world_e')
    expect(pageWxml).not.toContain('keep-_bbusiness_B')
    expect(pageWxml).not.toContain('App_dvue_c4')
    expect(pageWxml).not.toContain('index_dts_c120_c3')
    expect(pageWxml).not.toContain('not-generated_q_B')
  })

  it('preserves native dynamic layout branches in final weapp-vite WXML output', async () => {
    const projectBase = path.resolve(__dirname, '../demo')
    const root = path.resolve(projectBase, project.name)
    const projectPath = path.resolve(projectBase, project.projectPath)

    if (process.env.E2E_SKIP_BUILD !== '1') {
      await ensureProjectBuilt(root)
    }

    const [pageWxml, pageJs, pageJson] = await Promise.all([
      fs.readFile(path.resolve(projectPath, 'dist/pages/index/index.wxml'), 'utf8'),
      fs.readFile(path.resolve(projectPath, 'dist/pages/index/index.js'), 'utf8'),
      fs.readFile(path.resolve(projectPath, 'dist/pages/index/index.json'), 'utf8'),
    ])

    expect(pageWxml).toContain('weapp-layout-default')
    expect(pageWxml).toContain('weapp-layout-admin')
    expect(pageWxml).toContain('__wv_page_layout_name')
    expect(pageWxml).toContain(replaceWxml('tracking-[0.2em]'))
    expect(pageJs).toContain('__wv_page_layout_name')
    expect(pageJs).toContain('__wevuSetPageLayout')
    expect(pageJs).toContain('setPageLayout("admin")')
    expect(pageJson).toContain('weapp-layout-default')
    expect(pageJson).toContain('weapp-layout-admin')
  })
})
