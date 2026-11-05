import { describe, expect, it } from 'vitest'
import { removeReplacedPostcssGuardPatch } from '../scripts/ci/windows-utilities-patches.mjs'

const original = {
  patchedDependencies: {
    '@weapp-tailwindcss/postcss@3.3.2': 'patches/guard.patch',
    '@weapp-tailwindcss/postcss': 'patches/range.patch',
    'webpack@5.91.0': 'patches/webpack.patch',
  },
}

describe('Windows utilities 候选补丁边界', () => {
  it('仅移除候选已替换的历史精确探针补丁，保留其他补丁与原配置', () => {
    const result = removeReplacedPostcssGuardPatch(original, '3.4.3')
    expect(result).toEqual({ patchedDependencies: {
      '@weapp-tailwindcss/postcss': 'patches/range.patch',
      'webpack@5.91.0': 'patches/webpack.patch',
    } })
    expect(original.patchedDependencies['@weapp-tailwindcss/postcss@3.3.2']).toBe('patches/guard.patch')
  })

  it.each(['3.3.2', '^3.4.3', 'file:postcss.tgz', 'workspace:*', '', undefined, null])('不根据同版本或非精确候选 %s 删除补丁', (version) => {
    expect(removeReplacedPostcssGuardPatch(original, version)).toBe(original)
  })

  it('没有历史精确补丁时保留原配置', () => {
    const workspace = { patchedDependencies: { 'webpack@5.91.0': 'patches/webpack.patch' } }
    expect(removeReplacedPostcssGuardPatch(workspace, '3.4.3')).toBe(workspace)
    expect(removeReplacedPostcssGuardPatch({}, '3.4.3')).toEqual({})
  })
})
