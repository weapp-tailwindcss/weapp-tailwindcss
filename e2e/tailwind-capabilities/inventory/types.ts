export interface InventoryDeclaration {
  property: string
  value: string
  important: boolean
}

export interface ProfileWitness {
  profile: string
  candidate: string
}

export interface UtilityInventoryEntry {
  id: string
  kind: 'static' | 'functional'
  root: string
  witness: string
  declarations: InventoryDeclaration[]
  profileWitnesses: ProfileWitness[]
}

export interface VariantInventoryEntry {
  id: string
  kind: 'static' | 'functional' | 'compound'
  root: string
  witness: string
  compounds: number
  compoundsWith: number
  values: string[]
  isArbitrary: boolean
}

export interface TailwindInventory {
  schemaVersion: 1
  tailwindcss: string
  themeSha256: string
  utilities: UtilityInventoryEntry[]
  variants: VariantInventoryEntry[]
  completions: Array<{ candidate: string, modifiers: string[] }>
  supplements: Array<{ root: string, reason: string }>
}

export type DefaultDesignSystem = Awaited<ReturnType<typeof import('tailwindcss')['__unstable__loadDesignSystem']>>
