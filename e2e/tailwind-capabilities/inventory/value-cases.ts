import type { DefaultDesignSystem, TailwindInventory } from './types'
import { functionalValueProfiles } from '@weapp-tailwindcss/test-catalog'

/** 主题补全之外逐一覆盖每个适用的语法分支与边界值，保留上游明确接收的注册身份。 */
export function valueCases(inventory: TailwindInventory, design: DefaultDesignSystem) {
  return inventory.utilities.filter(item => item.kind === 'functional').flatMap(item => functionalValueProfiles.flatMap(profile => profile.values.flatMap((value, index) => {
    const candidate = value.startsWith('/')
      ? `${item.root}-red-500${value}`
      : value.startsWith('-')
        ? `${item.root.startsWith('-') ? item.root : `-${item.root}`}-${value.slice(1)}`
        : `${item.root}-${value}`
    const matches = design.parseCandidate(candidate).some(parsed => parsed.kind === 'functional' && parsed.root === item.root && design.compileAstNodes(parsed).length > 0)
    return matches ? [{ id: `${item.id}/profile/${profile.id}/${index}`, candidate, features: [item.id, profile.id] }] : []
  })))
}
