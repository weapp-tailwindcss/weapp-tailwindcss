import type { ProjectReport } from '../scripts/taro-plugin-html-style-snapshots/report'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { postcss } from '@weapp-tailwindcss/postcss'
import { describe, expect, it } from 'vitest'

const reportPath = path.resolve(__dirname, '__snapshots__/taro-plugin-html-style-output/report.json')
const snapshotRoot = path.dirname(reportPath)

async function readReport(): Promise<ProjectReport[]> {
  return JSON.parse(await readFile(reportPath, 'utf8'))
}

describe('taro plugin-html style output snapshots', () => {
  it('records with and without plugin-html outputs for every Taro demo', async () => {
    const report = await readReport()

    expect(report.map(item => item.project)).toEqual([
      'taro-webpack-react-tailwindcss-v4',
      'taro-vite-react-tailwindcss-v4',
      'taro-webpack-vue3-tailwindcss-v4',
      'taro-vite-vue3-tailwindcss-v4',
    ])

    for (const item of report) {
      expect(item.modes.map(mode => mode.mode), item.project).toEqual([
        'with-plugin-html',
        'without-plugin-html',
      ])
      for (const mode of item.modes) {
        expect(mode.status, `${item.project}:${mode.mode}`).toBe('passed')
        expect(mode.artifacts.map(artifact => artifact.fileName), `${item.project}:${mode.mode}`).toEqual(
          expect.arrayContaining([
            'app.wxss',
            'sub-normal/pages/index.wxss',
            'sub-independent/pages/index.wxss',
          ]),
        )
        expect(mode.artifacts.every(artifact => artifact.artifact.startsWith('artifacts/')), `${item.project}:${mode.mode}`).toBe(true)
        expect(mode.artifacts.every(artifact => /^[a-f0-9]{64}$/.test(artifact.sha256)), `${item.project}:${mode.mode}`).toBe(true)
      }
    }
  })

  it('checks every recorded artifact against its actual hash and size', async () => {
    for (const project of await readReport()) {
      for (const mode of project.modes) {
        for (const artifact of mode.artifacts) {
          const file = path.resolve(snapshotRoot, project.project, mode.mode, artifact.artifact)
          const content = await readFile(file)
          expect(createHash('sha256').update(content).digest('hex'), file).toBe(artifact.sha256)
          expect(content.byteLength, file).toBe(artifact.bytes)
          expect(content.toString('utf8').split('\n').length - 1, file).toBe(artifact.lines)
        }
      }
    }
  })

  it.each(['with-plugin-html', 'without-plugin-html'])('%s keeps default NutUI font smoothing in Vue artifacts', async (name) => {
    const project = (await readReport()).find(item => item.project === 'taro-webpack-vue3-tailwindcss-v4')!
    const mode = project.modes.find(item => item.mode === name)!
    let matched = 0
    for (const artifact of mode.artifacts) {
      const file = path.resolve(snapshotRoot, project.project, mode.mode, artifact.artifact)
      postcss.parse(await readFile(file, 'utf8'), { from: file }).walkRules((rule) => {
        if (!rule.selectors.includes('.nutui-iconfont')) {
          return
        }
        matched++
        const properties = new Map<string, string[]>()
        rule.walkDecls((decl) => {
          properties.set(decl.prop, [...(properties.get(decl.prop) ?? []), decl.value])
        })
        expect(properties.get('-webkit-font-smoothing'), file).toContain('antialiased')
        expect(properties.get('-moz-osx-font-smoothing'), file).toContain('grayscale')
      })
    }
    expect(matched).toBeGreaterThan(0)
  })

  it.each(['with-plugin-html', 'without-plugin-html'])('%s keeps issue 1286 author and generated rules in React artifacts', async (name) => {
    const project = (await readReport()).find(item => item.project === 'taro-webpack-react-tailwindcss-v4')!
    const mode = project.modes.find(item => item.mode === name)!
    const expected = new Map<string, Array<[string, string]>>([
      ['.issue-1286-icon', [['-webkit-font-smoothing', 'antialiased'], ['-moz-osx-font-smoothing', 'grayscale'], ['-webkit-tap-highlight-color', 'transparent']]],
      ['.issue-1286-highlight', [['-webkit-tap-highlight-color', 'transparent']]],
      ['.antialiased', [['-webkit-font-smoothing', 'antialiased'], ['-moz-osx-font-smoothing', 'grayscale']]],
      ['.subpixel-antialiased', [['-webkit-font-smoothing', 'auto'], ['-moz-osx-font-smoothing', 'auto']]],
    ])
    const matched = new Set<string>()
    for (const artifact of mode.artifacts) {
      const file = path.resolve(snapshotRoot, project.project, mode.mode, artifact.artifact)
      postcss.parse(await readFile(file, 'utf8'), { from: file }).walkRules((rule) => {
        for (const [selector, declarations] of expected) {
          if (!rule.selectors.includes(selector)) {
            continue
          }
          matched.add(selector)
          const properties = new Map<string, string[]>()
          rule.walkDecls((decl) => {
            properties.set(decl.prop, [...(properties.get(decl.prop) ?? []), decl.value])
          })
          for (const [property, value] of declarations) {
            expect(properties.get(property), `${file} ${selector}`).toContain(value)
          }
          if (selector === '.issue-1286-icon') {
            expect(properties.has('-webkit-appearance'), file).toBe(false)
          }
        }
      })
    }
    expect([...matched].sort()).toEqual([...expected.keys()].sort())
  })
})
