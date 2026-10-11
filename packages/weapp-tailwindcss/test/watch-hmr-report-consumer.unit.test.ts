import { describe, expect, it } from 'vitest'
import { assertHotUpdateReport } from '../../../e2e/watch/hot-update/shared'

type Report = Parameters<typeof assertHotUpdateReport>[0]

function fixture() {
  const project = 'demo/taro-webpack-vue3-tailwindcss-v4'
  const style = () => ({ mutationKind: 'style', hotUpdateEffectiveMs: 20, rollbackEffectiveMs: 20, rollbackOutputMs: 1, rollbackNeedleCleared: true })
  const roots = ['sub-normal', 'sub-independent'] as const
  return {
    options: { miniProgramScope: 'subpackages' },
    summary: { count: 1 },
    cases: [{
      name: 'taro-webpack-vue3-tailwindcss-v4',
      project,
      initialReadyMs: 10,
      hotUpdateEffectiveMs: 20,
      rounds: [],
      mutationMetrics: [],
      subPackageMutationMetrics: roots.map(root => ({
        root,
        globalStyleOutputs: ['consumed.css'],
        template: { hotUpdateEffectiveMs: 20, rounds: [{ hotUpdateEffectiveMs: 20 }, { hotUpdateEffectiveMs: 20 }, { hotUpdateEffectiveMs: 20 }] },
        style: style(),
      })),
    }],
    hmrDurations: {
      summaryBySurface: { 'template:preferred-round': { count: 1 } },
      byProject: {
        [project]: {
          project,
          timings: roots.flatMap(root => ['template', 'style'].map(kind => ({
            surface: `subpackage:${root}:${kind}`,
            hotUpdateEffectiveMs: 20,
            rollbackEffectiveMs: 20,
          }))),
        },
      },
    },
  } as unknown as Report
}

describe('Watch Action 消费侧的 style 回滚证据', () => {
  it('真实清理与耗时证据完整的分包 profile 可以通过', () => {
    expect(() => assertHotUpdateReport(fixture(), 'taro-webpack-vue3-tailwindcss-v4', 100)).not.toThrow()
  })

  it.each([false, undefined])('分包 profile 拒绝 clearance=%s，即使 fallback 耗时有效', (clearance) => {
    const report = fixture()
    report.cases[0]!.subPackageMutationMetrics![0]!.style.rollbackNeedleCleared = clearance
    expect(() => assertHotUpdateReport(report, 'taro-webpack-vue3-tailwindcss-v4', 100)).toThrow('rollback marker clearance must be verified')
  })

  it.each([false, undefined])('普通 profile 同样拒绝主包 clearance=%s', (clearance) => {
    const report = fixture()
    report.options = {}
    report.cases[0]!.mutationMetrics.push({
      mutationKind: 'style',
      rollbackNeedleCleared: clearance,
      rollbackOutputMs: 13,
      rollbackEffectiveMs: 13,
    } as Report['cases'][number]['mutationMetrics'][number])
    expect(() => assertHotUpdateReport(report, 'taro-webpack-vue3-tailwindcss-v4', 100)).toThrow('rollback marker clearance must be verified')
  })
})
