import type {
  CssCompatAction,
  WebCompatPolicy,
  WebCssCompatCapabilities,
  WebCssCompatDiagnostic,
  WebCssCompatFeature,
  WebCssCompatFeatures,
  WebCssCompatOptions,
  WebCssCompatPreset,
  WebCssCompatTargetSnapshot,
} from '../types'

export interface NormalizedWebCssCompatPolicy {
  actions: Readonly<Record<WebCssCompatFeature, CssCompatAction>>
  explicit: ReadonlySet<WebCssCompatFeature>
  layersMode: 'preserve' | 'ordered'
  layersOnConflict: 'warning' | 'error'
  specificityGuard: 'where' | 'legacy' | 'none'
  atRules: Readonly<Record<string, CssCompatAction>>
  capabilities: WebCssCompatCapabilities | undefined
  diagnostics: 'silent' | 'warning' | 'error'
  targets: WebCssCompatTargetSnapshot | undefined
}

const features: readonly WebCssCompatFeature[] = [
  'theme',
  'layers',
  'property',
  'nesting',
  'selectors',
  'typedDivision',
  'calc',
  'variables',
  'units',
  'oklch',
  'colorFunctions',
  'supports',
  'atRule',
]

const legacyActions: Record<WebCssCompatFeature, CssCompatAction> = {
  theme: 'lower',
  layers: 'lower',
  property: 'lower',
  nesting: 'lower',
  selectors: 'lower',
  typedDivision: 'lower',
  calc: 'preserve',
  variables: 'preserve',
  units: 'preserve',
  oklch: 'lower',
  colorFunctions: 'lower',
  supports: 'lower',
  atRule: 'preserve',
}

const offActions: Record<WebCssCompatFeature, CssCompatAction> = {
  theme: 'preserve',
  layers: 'preserve',
  property: 'preserve',
  nesting: 'preserve',
  selectors: 'preserve',
  typedDivision: 'preserve',
  calc: 'preserve',
  variables: 'preserve',
  units: 'preserve',
  oklch: 'preserve',
  colorFunctions: 'preserve',
  supports: 'preserve',
  atRule: 'preserve',
}

const featureFromLegacy: Readonly<Record<keyof WebCssCompatFeatures, WebCssCompatFeature>> = {
  theme: 'theme',
  layer: 'layers',
  property: 'property',
  nesting: 'nesting',
  oklch: 'oklch',
  colorFunctions: 'colorFunctions',
  supports: 'supports',
}

const minimumVersions: Readonly<Record<Exclude<WebCssCompatFeature, 'theme' | 'atRule' | 'units'>, Readonly<Record<string, string>>>> = {
  layers: { chrome: '99', edge: '99', firefox: '97', safari: '15.4', ios_saf: '15.4', ios: '15.4', and_chr: '99' },
  property: { chrome: '85', edge: '85', firefox: '128', safari: '16.4', ios_saf: '16.4', ios: '16.4', and_chr: '85' },
  nesting: { chrome: '120', edge: '120', firefox: '117', safari: '17.2', ios_saf: '17.2', ios: '17.2', and_chr: '120' },
  selectors: { chrome: '88', edge: '88', firefox: '78', safari: '14', ios_saf: '14', ios: '14', and_chr: '88' },
  typedDivision: { chrome: '111', edge: '111', firefox: '108', safari: '15.4', ios_saf: '15.4', ios: '15.4', and_chr: '111' },
  calc: { chrome: '26', edge: '12', firefox: '16', safari: '7', ios_saf: '7', ios: '7', and_chr: '26' },
  variables: { chrome: '49', edge: '15', firefox: '31', safari: '9.1', ios_saf: '9.3', ios: '9.3', and_chr: '49' },
  oklch: { chrome: '111', edge: '111', firefox: '113', safari: '15', ios_saf: '15', ios: '15', and_chr: '111' },
  colorFunctions: { chrome: '111', edge: '111', firefox: '113', safari: '16.2', ios_saf: '16.2', ios: '16.2', and_chr: '111' },
  supports: { chrome: '28', edge: '12', firefox: '22', safari: '9', ios_saf: '9', ios: '9', and_chr: '28' },
}

const minimumViewportUnitVersions: Readonly<Record<string, string>> = {
  chrome: '108',
  edge: '108',
  firefox: '101',
  safari: '15.4',
  ios_saf: '15.4',
  ios: '15.4',
  and_chr: '108',
}

const minimumContainerUnitVersions: Readonly<Record<string, string>> = {
  chrome: '105',
  edge: '105',
  firefox: '110',
  safari: '16',
  ios_saf: '16',
  ios: '16',
  and_chr: '105',
}

const minimumAtRuleVersions: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  'container': { chrome: '105', edge: '105', firefox: '110', safari: '16', ios_saf: '16', ios: '16', and_chr: '105' },
  'starting-style': { chrome: '117', edge: '117', firefox: '129', safari: '17.5', ios_saf: '17.5', ios: '17.5', and_chr: '117' },
  'scope': { chrome: '118', edge: '118', firefox: '146', safari: '17.4', ios_saf: '17.4', ios: '17.4', and_chr: '118' },
}

const universallySupportedAtRules = new Set([
  'charset',
  'font-face',
  'import',
  'keyframes',
  'media',
  'namespace',
  'page',
  'supports',
])

function normalizeTargets(targets: WebCompatPolicy['targets']): WebCssCompatTargetSnapshot | undefined {
  if (targets === undefined) {
    return undefined
  }
  if (typeof targets === 'string') {
    return { source: 'explicit', targets: [targets] }
  }
  if (Array.isArray(targets)) {
    return { source: 'explicit', targets: [...targets] }
  }
  return {
    source: 'explicit',
    targets: Object.entries(targets).map(([browser, version]) => `${browser} ${version}`),
  }
}

function normalizeAction(action: CssCompatAction | undefined, fallback: CssCompatAction): CssCompatAction {
  return action === 'preserve' || action === 'lower' || action === 'warn' || action === 'error' || action === 'remove'
    ? action
    : fallback
}

function applyLegacyFeatures(
  actions: Record<WebCssCompatFeature, CssCompatAction>,
  explicit: Set<WebCssCompatFeature>,
  values: WebCssCompatFeatures | undefined,
) {
  for (const [name, feature] of Object.entries(featureFromLegacy) as [keyof WebCssCompatFeatures, WebCssCompatFeature][]) {
    const value = values?.[name]
    if (value !== undefined) {
      actions[feature] = value ? 'lower' : 'preserve'
      explicit.add(feature)
    }
  }
}

function applyPolicyAction(
  actions: Record<WebCssCompatFeature, CssCompatAction>,
  explicit: Set<WebCssCompatFeature>,
  policy: WebCompatPolicy | undefined,
) {
  if (!policy) {
    return
  }
  const set = (feature: WebCssCompatFeature, action: CssCompatAction | undefined) => {
    if (action !== undefined) {
      actions[feature] = action
      explicit.add(feature)
    }
  }
  if (policy.theme !== undefined) {
    set('theme', normalizeAction(policy.theme, actions.theme))
  }
  if (policy.layers?.action !== undefined) {
    set('layers', normalizeAction(policy.layers.action, actions.layers))
  }
  if (policy.property !== undefined) {
    set('property', normalizeAction(policy.property, actions.property))
  }
  if (policy.nesting !== undefined) {
    set('nesting', normalizeAction(policy.nesting, actions.nesting))
  }
  if (policy.selectors?.action !== undefined) {
    set('selectors', normalizeAction(policy.selectors.action, actions.selectors))
  }
  if (policy.values?.typedDivision !== undefined) {
    set('typedDivision', normalizeAction(policy.values.typedDivision, actions.typedDivision))
  }
  if (policy.values?.calc !== undefined) {
    set('calc', normalizeAction(policy.values.calc, actions.calc))
  }
  if (policy.values?.variables !== undefined) {
    set('variables', normalizeAction(policy.values.variables, actions.variables))
  }
  if (policy.values?.units !== undefined) {
    set('units', normalizeAction(policy.values.units, actions.units))
  }
  if (policy.values?.oklch !== undefined) {
    set('oklch', normalizeAction(policy.values.oklch, actions.oklch))
  }
  if (policy.values?.colorFunctions !== undefined) {
    set('colorFunctions', normalizeAction(policy.values.colorFunctions, actions.colorFunctions))
  }
  if (policy.atRules?.supports !== undefined) {
    set('supports', normalizeAction(policy.atRules.supports, actions.supports))
  }
}

export function normalizeWebCssCompatPolicy(
  options: WebCssCompatOptions | undefined,
  targets: WebCssCompatTargetSnapshot | undefined = options?.policy ? normalizeTargets(options.policy.targets) : undefined,
): NormalizedWebCssCompatPolicy {
  const preset: WebCssCompatPreset = options?.preset ?? 'legacy-web'
  const actions = { ...(preset === 'legacy-web' ? legacyActions : offActions) }
  const explicit = new Set<WebCssCompatFeature>()
  applyLegacyFeatures(actions, explicit, options?.features)
  applyPolicyAction(actions, explicit, options?.policy)
  const policy = options?.policy
  const atRules = Object.fromEntries(Object.entries(policy?.atRules ?? {}).map(([name, action]) => [name.toLowerCase(), normalizeAction(action, 'preserve')]))
  if (Object.keys(atRules).length > 0) {
    actions.atRule = 'warn'
  }
  return {
    actions,
    explicit,
    layersMode: policy?.layers?.mode ?? 'ordered',
    layersOnConflict: policy?.layers?.onConflict ?? 'warning',
    specificityGuard: policy?.selectors?.specificityGuard ?? 'where',
    atRules,
    capabilities: policy?.capabilities,
    diagnostics: policy?.diagnostics ?? 'warning',
    targets,
  }
}

export function actionIsTransforming(action: CssCompatAction) {
  return action === 'lower' || action === 'remove' || action === 'error' || action === 'warn'
}

function parseTarget(target: string) {
  const match = /^\s*([a-z_]+)\s*(?:(?:>=|[>=~^])\s*)?(\d+(?:\.\d+)*)/i.exec(target)
  if (!match) {
    return undefined
  }
  return { browser: match[1]!.toLowerCase(), version: match[2]!.split('.').map(Number) }
}

function compareVersions(actual: readonly number[], minimum: readonly number[]) {
  const parts = Math.max(actual.length, minimum.length)
  for (let index = 0; index < parts; index++) {
    const actualPart = actual[index] ?? 0
    const minimumPart = minimum[index] ?? 0
    if (actualPart !== minimumPart) {
      return actualPart > minimumPart ? 1 : -1
    }
  }
  return 0
}

interface FeatureSupportContext {
  atRuleName?: string | undefined
  units?: readonly string[] | undefined
}

function explicitCapability(
  feature: WebCssCompatFeature,
  capabilities: WebCssCompatCapabilities | undefined,
  context: FeatureSupportContext,
): boolean | undefined {
  if (!capabilities) {
    return undefined
  }
  if (feature === 'atRule') {
    return context.atRuleName
      ? capabilities.atRules?.[context.atRuleName.toLowerCase()] ?? capabilities.atRule
      : capabilities.atRule
  }
  if (feature === 'units') {
    if (typeof capabilities.units === 'boolean') {
      return capabilities.units
    }
    if (!capabilities.units || !context.units?.length) {
      return undefined
    }
    const values = context.units.map(unit => capabilities.units?.[unit.toLowerCase()])
    if (values.includes(false)) {
      return false
    }
    return values.every(value => value === true) ? true : undefined
  }
  return capabilities[feature]
}

function supportsModernUnit(unit: string, target: string) {
  const parsed = parseTarget(target)
  if (!parsed) {
    return undefined
  }
  const minimum = (unit.startsWith('cq') ? minimumContainerUnitVersions : minimumViewportUnitVersions)[parsed.browser]
  return minimum === undefined
    ? undefined
    : compareVersions(parsed.version, minimum.split('.').map(Number)) >= 0
}

function supportsFeature(
  feature: WebCssCompatFeature,
  target: string,
  context: FeatureSupportContext = {},
  capabilities?: WebCssCompatCapabilities,
) {
  const explicit = explicitCapability(feature, capabilities, context)
  if (explicit !== undefined) {
    return explicit
  }
  if (feature === 'units') {
    if (!context.units?.length) {
      return undefined
    }
    const support = context.units.map(unit => supportsModernUnit(unit, target))
    if (support.includes(false)) {
      return false
    }
    return support.every(value => value === true) ? true : undefined
  }
  if (feature === 'theme') {
    return false
  }
  if (feature === 'atRule') {
    const name = context.atRuleName?.toLowerCase()
    if (!name) {
      return undefined
    }
    if (universallySupportedAtRules.has(name)) {
      return true
    }
    const parsed = parseTarget(target)
    if (!parsed) {
      return undefined
    }
    const minimum = minimumAtRuleVersions[name]?.[parsed.browser]
    return minimum === undefined
      ? undefined
      : compareVersions(parsed.version, minimum.split('.').map(Number)) >= 0
  }
  const parsed = parseTarget(target)
  if (!parsed) {
    return undefined
  }
  const minimum = minimumVersions[feature]?.[parsed.browser]
  return minimum === undefined
    ? undefined
    : compareVersions(parsed.version, minimum.split('.').map(Number)) >= 0
}

export function unsupportedTargets(
  feature: WebCssCompatFeature,
  targets: WebCssCompatTargetSnapshot | undefined,
  context: FeatureSupportContext = {},
  capabilities?: WebCssCompatCapabilities,
) {
  const values = targets?.targets ?? []
  if (values.length === 0) {
    return explicitCapability(feature, capabilities, context) === false ? ['unspecified'] : []
  }
  return values.filter(target => supportsFeature(feature, target, context, capabilities) !== true)
}

export function targetsForDiagnostic(
  feature: WebCssCompatFeature,
  action: CssCompatAction,
  targets: WebCssCompatTargetSnapshot | undefined,
  context: FeatureSupportContext = {},
  capabilities?: WebCssCompatCapabilities,
) {
  if (action === 'preserve') {
    return unsupportedTargets(feature, targets, context, capabilities)
  }
  if (!targets || targets.targets.length === 0) {
    return ['unspecified']
  }
  return [...targets.targets]
}

export function createWebCssCompatDiagnostic(
  input: Omit<WebCssCompatDiagnostic, 'target'> & { target?: string | undefined },
  target = 'unspecified',
): WebCssCompatDiagnostic {
  return { ...input, target }
}

export function featureList() {
  return features
}
