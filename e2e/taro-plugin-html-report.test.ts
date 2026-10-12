import type { ProjectReport } from '../scripts/taro-plugin-html-style-snapshots/report'
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
