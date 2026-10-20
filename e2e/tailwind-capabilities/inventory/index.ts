import type { TailwindInventory } from './types'
import { readFile } from 'node:fs/promises'

export { collectInventory, loadDefaultDesignSystem } from './collect'
export type * from './types'

export async function loadInventory(): Promise<TailwindInventory> {
  const stored = JSON.parse(await readFile(new URL('./tailwind-4.3.3.json', import.meta.url), 'utf8')) as Omit<TailwindInventory, 'completions'> & {
    modifierGroups: string[][]
    completions: Array<{ candidate: string, modifierGroup: number }>
  }
  const { modifierGroups, ...inventory } = stored
  return { ...inventory, completions: inventory.completions.map(item => ({ candidate: item.candidate, modifiers: modifierGroups[item.modifierGroup]! })) }
}

export function serializeInventory(inventory: TailwindInventory) {
  const modifierGroups: string[][] = []
  const groups = new Map<string, number>()
  const completions = inventory.completions.map(({ candidate, modifiers }) => {
    const signature = JSON.stringify(modifiers)
    let modifierGroup = groups.get(signature)
    if (modifierGroup === undefined) {
      modifierGroup = modifierGroups.length
      modifierGroups.push(modifiers)
      groups.set(signature, modifierGroup)
    }
    return { candidate, modifierGroup }
  })
  const { utilities, variants, supplements, ...header } = inventory
  const lines = [JSON.stringify({ ...header, completions: undefined }).slice(0, -1)]
  for (const [name, entries] of Object.entries({ modifierGroups, utilities, variants, completions, supplements })) {
    lines.push(`,"${name}":[\n${entries.map(item => `  ${JSON.stringify(item)}`).join(',\n')}\n]`)
  }
  return `${lines.join('\n')}\n}\n`
}

export function validateInventory(actual: TailwindInventory, expected: TailwindInventory) {
  const compare = (name: string, observed: unknown, registered: unknown) => {
    if (JSON.stringify(observed) !== JSON.stringify(registered)) {
      throw new Error(`Tailwind ${name} 能力发生漂移；必须审查新增、删除和预期并显式更新 manifest，不能自动接受。`)
    }
  }
  compare('version', actual.tailwindcss, expected.tailwindcss)
  compare('theme', actual.themeSha256, expected.themeSha256)
  compare('utilities', actual.utilities, expected.utilities)
  compare('variants', actual.variants, expected.variants)
  compare('completions', actual.completions, expected.completions)
  compare('supplements', actual.supplements, expected.supplements)
}
