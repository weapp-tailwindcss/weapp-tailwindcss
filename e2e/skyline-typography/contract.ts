export interface TypographyRect {
  id: string
  width: number
  height: number
  [key: string]: unknown
}

export interface TypographyPhase {
  name: string
  button: string | undefined
  value: string
  header: number
  small: number
  weight: 400 | 700
  themeClear?: boolean
}

export const typographyPhases: TypographyPhase[] = [
  { name: 'default', button: undefined, value: '0/0/0', header: 64, small: 40, weight: 700 },
  { name: 'inline', button: 'probe-inline', value: '1/0/0', header: 88, small: 88, weight: 400 },
  { name: 'inline-clear', button: 'probe-inline', value: '0/0/0', header: 64, small: 40, weight: 700 },
  { name: 'utility', button: 'probe-utility-toggle', value: '0/1/0', header: 72, small: 72, weight: 400 },
  { name: 'combined', button: 'probe-inline', value: '1/1/0', header: 72, small: 72, weight: 400 },
  { name: 'inline-clear-utility', button: 'probe-inline', value: '0/1/0', header: 72, small: 72, weight: 400 },
  { name: 'utility-clear', button: 'probe-utility-toggle', value: '0/0/0', header: 64, small: 40, weight: 700 },
  { name: 'theme', button: 'probe-theme', value: '0/0/1', header: 80, small: 48, weight: 400 },
  { name: 'theme-clear', button: 'probe-theme', value: '0/0/0', header: 64, small: 40, weight: 700, themeClear: true },
  { name: 'utility-after-theme', button: 'probe-utility-toggle', value: '0/1/0', header: 72, small: 72, weight: 400 },
  { name: 'reset', button: 'probe-reset', value: '0/0/0', header: 64, small: 40, weight: 700 },
]

export const typographyComponents = [
  'SkylineTypographyProbe',
  'SkylineTypographyNoStyle',
  'SkylineTypographyScoped',
  'SkylineTypographyExternal',
] as const

const nestedScopes = [
  { prefix: 'probe-no-style-', selector: '.skyline-probe >>> .probe-no-style' },
  { prefix: 'probe-scoped-', selector: '.skyline-probe >>> .probe-no-style >>> .probe-scoped' },
  { prefix: 'probe-external-', selector: '.skyline-probe >>> .probe-no-style >>> .probe-scoped >>> .probe-external' },
]

export const headerIds = ['probe-utility', 'probe-child', ...nestedScopes.map(scope => `${scope.prefix}header`)]
export const smallIds = ['probe-child-small', ...nestedScopes.map(scope => `${scope.prefix}small`)]
export const weightIds = ['probe-weight', 'probe-child-weight', ...nestedScopes.map(scope => `${scope.prefix}weight`)]
export const fallbackIds = ['missing', 'initial', 'empty', 'valid', 'cycle']
  .flatMap(reset => ['literal', 'nested'].map(fallback => `probe-${reset}-${fallback}`))
export const typographyIds = [
  ...headerIds,
  ...smallIds,
  ...weightIds,
  ...fallbackIds,
  'probe-original',
  'probe-reference',
  'probe-weight-original',
  'probe-weight-reference',
  'probe-weight-regular',
  'probe-theme-variable',
  'probe-theme-small-variable',
  'probe-theme-weight',
  'probe-author-empty',
  'probe-normal',
]

export function typographySelector(id: string) {
  const scope = nestedScopes.find(scope => id.startsWith(scope.prefix))
  return `${scope?.selector ?? '.skyline-probe'} >>> #${id}`
}
