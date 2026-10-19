export const RN_ENTRY_SCOPE_VERSION = 2

export const authoringScopes = [
  { id: 'legacy', entry: 'styles/legacy.css', candidates: ['p-legacy', 'lynx-plugin-utility'], files: ['styles/legacy.css', 'tailwind.config.mjs', 'tailwind-plugin.mjs'] },
  { id: 'prefix', entry: 'styles/prefix.css', candidates: ['tw:flex'], files: ['styles/prefix.css'] },
  { id: 'reference', entry: 'styles/reference.css', candidates: ['lynx-reference'], files: ['styles/reference.css'] },
] as const

export const authoringCaseScopes: Record<string, readonly string[]> = {
  'directive-config-plugin': ['legacy'],
  'directive-prefix-important': ['prefix', 'legacy'],
  'directive-reference': ['reference'],
}
