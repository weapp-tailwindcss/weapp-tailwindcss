import type { RuleEvidence } from './static-evidence'
import { responsiveContract } from '../../examples/react-lynx/src/compatibility/responsive-contract'
import { walkClasses } from '../../packages/postcss/src/compat/native/selectors'
import { matchEncodedDeclaration } from './encoded-declarations'

/** 原始生成与实际 bundle 都须保留同一媒体条件，禁止无条件提升或删除。 */
export function assertResponsiveGuard(rules: RuleEvidence[], stage: 'generation' | 'encoding') {
  const matches = rules.filter(rule => walkClasses(rule.selector).includes('max-md:w-[200px]'))
  const condition = responsiveContract.condition.replace(/\s/g, '')
  if (matches.length !== 1 || matches[0]!.mediaConditions?.length !== 1 || matches[0]!.mediaConditions[0]!.replace(/\s/g, '') !== condition
    || !matchEncodedDeclaration(matches[0]!.declarations, { property: 'width', value: '200px' })) {
    throw new Error(`响应式 ${stage} 缺少唯一且完整的 width < 48rem 守卫`)
  }
  const marker = rules.filter(rule => rule.selector === '.probe-responsive-threshold')
  if (marker.length !== 1 || marker[0]!.mediaConditions?.length || !matchEncodedDeclaration(marker[0]!.declarations, { property: 'width', value: '48rem' })) {
    throw new Error(`响应式 ${stage} 缺少独立 48rem 标尺`)
  }
}
