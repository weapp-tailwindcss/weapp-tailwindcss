import type { ProjectReport } from '../scripts/taro-plugin-html-style-snapshots/report'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { execa } from 'execa'
import { describe, expect, it } from 'vitest'
import { mergeScopedPluginHtmlReports, verifyPluginHtmlReports } from '../scripts/taro-plugin-html-style-snapshots/report'

function report(project: string, durationMs = 1, sha256 = 'a'): ProjectReport {
  return {
    project,
    cssFiles: ['dist/app.wxss'],
    modes: [{
      mode: 'with-plugin-html',
      status: 'passed',
      command: 'pnpm run build:weapp',
      durationMs,
      artifacts: [{
        fileName: 'app.wxss',
        artifact: 'artifacts/app.wxss',
        bytes: 1,
        lines: 1,
        selectors: 1,
        hasTaroSelector: false,
        hasWeappEscapedArbitrarySelector: false,
        h5AliasSelectors: 0,
        rawHtmlTagSelectors: 0,
        cursorDeclarations: 0,
        sha256,
      }],
    }],
    comparison: { sameArtifactCount: true, sameHashes: true, changedFiles: [], onlyWithPluginHtml: [], onlyWithoutPluginHtml: [] },
  }
}

describe('plugin-html 定向基线与只读复验', () => {
  it('独立 Node 脚本无需 Vitest alias 即可读取和规范化 CSS 产物', async () => {
    const { stdout } = await execa(process.execPath, ['--import', 'tsx', '--input-type=module', '--eval', `
      import assert from 'node:assert/strict'
      import { normalizeRawCssSnapshotText } from './e2e/snapshotUtils.ts'
      const css = normalizeRawCssSnapshotText('.sample{color:red}')
      assert.match(css, /color:red/)
      console.log('standalone-css-snapshot-ok')
    `], { cwd: fileURLToPath(new URL('../', import.meta.url)) })
    expect(stdout).toBe('standalone-css-snapshot-ok')
  })

  it('替换所选项目并保留其余项目、顺序和输入对象', () => {
    const baseline = [report('react'), report('vite'), report('vue')]
    const current = [report('vue', 2), report('react', 3)]
    expect(mergeScopedPluginHtmlReports(baseline, current)).toEqual([current[1], baseline[1], current[0]])
    expect(baseline.map(item => item.modes[0]?.durationMs)).toEqual([1, 1, 1])
    expect(mergeScopedPluginHtmlReports(baseline, [])).toEqual(baseline)
  })

  it('追加新增项目并拒绝重复的本轮项目', () => {
    const baseline = [report('react')]
    expect(mergeScopedPluginHtmlReports(baseline, [report('vue')])).toEqual([...baseline, report('vue')])
    expect(() => mergeScopedPluginHtmlReports(baseline, [report('vue'), report('vue')])).toThrow('重复')
  })

  it('忽略构建耗时，但检查产物哈希、元数据与缺失项目', () => {
    expect(() => verifyPluginHtmlReports([report('vue')], [report('vue', 100)])).not.toThrow()
    expect(() => verifyPluginHtmlReports([report('vue')], [report('vue', 100, 'b')])).toThrow('产物基线不一致')
    const changed = report('vue')
    changed.cssFiles.push('dist/page.wxss')
    expect(() => verifyPluginHtmlReports([report('vue')], [changed])).toThrow('产物基线不一致')
    expect(() => verifyPluginHtmlReports([], [report('vue')])).toThrow('缺少项目基线')
  })
})
