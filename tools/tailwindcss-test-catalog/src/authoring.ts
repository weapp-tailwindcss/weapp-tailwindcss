import type { ExpectedDeclaration } from './compatibility/types'

export interface AuthoringFixture {
  id: string
  css: string
  files: Record<string, string>
  candidates: string[]
  expectedDeclarations: Array<{ candidate?: string, selector?: string, declarations: ExpectedDeclaration[] }>
  absentCandidates?: string[]
}

const entry = '@import "tailwindcss" source(none);\n'

export const authoringFixtures: AuthoringFixture[] = [
  { id: 'import', css: entry, files: {}, candidates: ['flex'], expectedDeclarations: [{ candidate: 'flex', declarations: [{ property: 'display', value: 'flex' }] }] },
  { id: 'theme', css: `${entry}@theme { --color-catalog-brand: #123456; }`, files: {}, candidates: ['bg-catalog-brand'], expectedDeclarations: [{ candidate: 'bg-catalog-brand', declarations: [{ property: 'background-color', value: 'var(--color-catalog-brand)' }] }] },
  { id: 'theme-inline', css: `${entry}@theme inline { --color-catalog-brand: var(--brand); }`, files: {}, candidates: ['bg-catalog-brand'], expectedDeclarations: [{ candidate: 'bg-catalog-brand', declarations: [{ property: 'background-color', value: 'var(--brand)' }] }] },
  { id: 'source-inline', css: `${entry}@source inline("{hover:,focus:,}bg-red-{500,600}");`, files: {}, candidates: [], expectedDeclarations: [{ candidate: 'hover:bg-red-500', declarations: [{ property: 'background-color' }] }, { candidate: 'focus:bg-red-600', declarations: [{ property: 'background-color' }] }] },
  { id: 'source-not-inline', css: `${entry}@source inline("p-{1..3}");\n@source not inline("p-2");`, files: {}, candidates: [], expectedDeclarations: [{ candidate: 'p-1', declarations: [{ property: 'padding' }] }, { candidate: 'p-3', declarations: [{ property: 'padding' }] }], absentCandidates: ['p-2'] },
  { id: 'source-file', css: `${entry}@source "./probe.html";`, files: { 'probe.html': '<div class="w-[123px]"></div>' }, candidates: [], expectedDeclarations: [{ candidate: 'w-[123px]', declarations: [{ property: 'width', value: '123px' }] }] },
  { id: 'source-exclusion', css: `${entry}@source "./included.html";\n@source not "./excluded.html";`, files: { 'included.html': '<div class="w-[123px]"></div>', 'excluded.html': '<div class="h-[789px]"></div>' }, candidates: [], expectedDeclarations: [{ candidate: 'w-[123px]', declarations: [{ property: 'width', value: '123px' }] }], absentCandidates: ['h-[789px]'] },
  { id: 'utility', css: `${entry}@utility catalog-content { content-visibility: auto; }`, files: {}, candidates: ['catalog-content'], expectedDeclarations: [{ candidate: 'catalog-content', declarations: [{ property: 'content-visibility', value: 'auto' }] }] },
  { id: 'utility-functional', css: `${entry}@utility catalog-tab-* { tab-size: --value(integer); }`, files: {}, candidates: ['catalog-tab-7'], expectedDeclarations: [{ candidate: 'catalog-tab-7', declarations: [{ property: 'tab-size', value: '7' }] }] },
  { id: 'custom-variant', css: `${entry}@custom-variant catalog-dark (&:where(.catalog-dark, .catalog-dark *));`, files: {}, candidates: ['catalog-dark:flex'], expectedDeclarations: [{ candidate: 'catalog-dark:flex', declarations: [{ property: 'display', value: 'flex' }] }] },
  { id: 'variant', css: `${entry}.catalog-variant { @variant dark { color: #123456; } }`, files: {}, candidates: [], expectedDeclarations: [{ selector: '.catalog-variant', declarations: [{ property: 'color', value: '#123456' }] }] },
  { id: 'apply', css: `${entry}.catalog-apply { @apply flex p-[17px]; }`, files: {}, candidates: [], expectedDeclarations: [{ selector: '.catalog-apply', declarations: [{ property: 'display', value: 'flex' }, { property: 'padding', value: '17px' }] }] },
  { id: 'reference', css: '@reference "./theme.css";\n.catalog-reference { @apply p-[17px] bg-catalog-brand; }', files: { 'theme.css': `${entry}@theme { --color-catalog-brand: #123456; }` }, candidates: [], expectedDeclarations: [{ selector: '.catalog-reference', declarations: [{ property: 'padding', value: '17px' }, { property: 'background-color', value: 'var(--color-catalog-brand)' }] }] },
  { id: 'config', css: `${entry}@config "./catalog.config.cjs";`, files: { 'catalog.config.cjs': 'module.exports = { theme: { extend: { spacing: { catalog: "19px" } } } }' }, candidates: ['p-catalog'], expectedDeclarations: [{ candidate: 'p-catalog', declarations: [{ property: 'padding', value: '19px' }] }] },
  { id: 'plugin', css: `${entry}@plugin "./catalog.plugin.cjs";`, files: { 'catalog.plugin.cjs': 'module.exports = function({ addUtilities }) { addUtilities({ ".catalog-plugin": { opacity: "0.73" } }) }' }, candidates: ['catalog-plugin'], expectedDeclarations: [{ candidate: 'catalog-plugin', declarations: [{ property: 'opacity', value: '0.73' }] }] },
  { id: 'prefix', css: '@import "tailwindcss" prefix(tw) source(none);', files: {}, candidates: ['tw:flex', 'flex'], expectedDeclarations: [{ candidate: 'tw:flex', declarations: [{ property: 'display', value: 'flex' }] }], absentCandidates: ['flex'] },
  { id: 'important', css: '@import "tailwindcss" important source(none);', files: {}, candidates: ['flex'], expectedDeclarations: [{ candidate: 'flex', declarations: [{ property: 'display', value: 'flex', important: true }] }] },
  { id: 'theme-function', css: `${entry}.catalog-theme-function { padding: --spacing(4); color: --theme(--color-red-500); }`, files: {}, candidates: [], expectedDeclarations: [{ selector: '.catalog-theme-function', declarations: [{ property: 'padding' }, { property: 'color' }] }] },
]

export const cssAuthoringCapabilities = [
  'import',
  'theme',
  'theme-inline',
  'source-inline',
  'source-not-inline',
  'source-file',
  'source-exclusion',
  'utility',
  'utility-functional',
  'custom-variant',
  'variant',
  'apply',
  'reference',
  'config',
  'plugin',
  'prefix',
  'important',
  'theme-function',
] as const
