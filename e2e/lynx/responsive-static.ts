import type { RuleEvidence } from './static-evidence'
import { isDeepStrictEqual } from 'node:util'
import { responsiveContract } from '../../examples/react-lynx/src/compatibility/responsive-contract'
import { walkClasses } from '../../packages/postcss/src/compat/native/selectors'
import { matchEncodedDeclaration } from './encoded-declarations'

/** 原始生成与实际 bundle 都须保留同一媒体条件，禁止无条件提升或删除。 */
export function assertResponsiveGuard(rules: RuleEvidence[], stage: 'generation' | 'encoding') {
  const matches = rules.filter(rule => walkClasses(rule.selector).includes('max-md:w-[200px]'))
  const condition = responsiveContract.condition.replace(/\s/g, '')
  if (matches.length !== 1 || matches[0]!.mediaConditions?.length !== 1 || matches[0]!.mediaConditions[0]!.replace(/\s/g, '') !== condition
    || matches[0]!.supportsConditions?.length
    || !matchEncodedDeclaration(matches[0]!.declarations, { property: 'width', value: '200px' })) {
    throw new Error(`响应式 ${stage} 缺少唯一且完整的 width < 48rem 守卫`)
  }
  const marker = rules.filter(rule => walkClasses(rule.selector).includes('probe-responsive-threshold'))
  // CSS 入口展开可重复同一规则；必须逐份核验 selector、全部声明及无条件身份。
  if (marker.length === 0 || marker.some(rule => rule.selector !== '.probe-responsive-threshold'
    || rule.mediaConditions?.length || rule.supportsConditions?.length
    || !isDeepStrictEqual(rule.declarations, marker[0]!.declarations)
    || !matchEncodedDeclaration(rule.declarations, { property: 'width', value: '48rem' }))) {
    throw new Error(`响应式 ${stage} 缺少独立 48rem 标尺`)
  }
}
