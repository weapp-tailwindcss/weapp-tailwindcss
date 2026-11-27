import type { TransformWebCssCompatProcessing } from '@weapp-tailwindcss/postcss/transform'
import type { WebCssCompatTargetSnapshot, WebCssCompatUserOptions } from '@weapp-tailwindcss/postcss/types'
import type { ViteFrameworkCssPipelineContext, ViteFrameworkCssPipelineStrategy } from './shared/framework-strategy'
import { transformWebCssCompat } from '@weapp-tailwindcss/postcss/transform'
import browserslist from 'browserslist'

export interface ViteWebCssCompatConfiguration {
  options: WebCssCompatUserOptions | undefined
  target: WebCssCompatTargetSnapshot | undefined
}

export interface ViteWebCssCompatProcessing {
  deferPropertyFallback?: boolean | undefined
  file?: string | undefined
  onDiagnostic?: TransformWebCssCompatProcessing['onDiagnostic']
}

const viteBrowserTargets = new Set([
  'and_chr',
  'and_ff',
  'and_qq',
  'and_uc',
  'android',
  'baidu',
  'bb',
  'chrome',
  'deno',
  'edge',
  'firefox',
  'ie',
  'ie_mob',
  'ios',
  'ios_saf',
  'kaios',
  'node',
  'opera',
  'op_mob',
  'op_mini',
  'safari',
  'samsung',
])

function normalizeViteBrowserTarget(target: string) {
  const match = /^([a-z_]+)(\d+(?:\.\d+)*)$/i.exec(target.trim())
  if (!match || !viteBrowserTargets.has(match[1]!.toLowerCase())) {
    return target
  }
  return `${match[1]} ${match[2]}`
}

function normalizeTargets(targets: string | readonly string[] | Readonly<Record<string, string>>) {
  if (typeof targets === 'string') {
    return [targets]
  }
  if (Array.isArray(targets)) {
    return [...targets]
  }
  return Object.entries(targets).map(([browser, version]) => `${browser} ${version}`)
}

function resolveBrowserslistTargets(
  values: readonly string[],
  root: string | undefined,
): readonly string[] | undefined {
  try {
    const query = values.map(normalizeViteBrowserTarget)
    return browserslist(query.length === 1 ? query[0]! : [...query], { path: root })
  }
  catch {
    return undefined
  }
}

function isGenericBuildTarget(target: string) {
  return target === 'modules' || target === 'esnext' || /^es\d{4}$/i.test(target)
}

function resolveTargetSnapshot(
  targets: string | readonly string[] | Readonly<Record<string, string>> | undefined,
  viteTarget: WebCssCompatTargetSnapshot | undefined,
  root: string | undefined,
  targetDisabled = false,
): WebCssCompatTargetSnapshot | undefined {
  if (targets !== undefined) {
    const values = normalizeTargets(targets)
    const resolved = resolveBrowserslistTargets(values, root)
    return { source: 'explicit', targets: resolved ?? values }
  }
  if (viteTarget) {
    const resolved = resolveBrowserslistTargets(viteTarget.targets, root)
    if (resolved) {
      return { source: viteTarget.source, targets: resolved }
    }
    if (viteTarget.source === 'vite-css-target' || viteTarget.targets.some(target => !isGenericBuildTarget(target))) {
      return viteTarget
    }
  }
  if (targetDisabled || !root || !browserslist.findConfig(root)) {
    return undefined
  }
  try {
    return { source: 'browserslist', targets: browserslist(undefined, { path: root }) }
  }
  catch {
    return undefined
  }
}

function resolveConfiguration(
  value: WebCssCompatUserOptions | undefined,
  viteTarget: WebCssCompatTargetSnapshot | undefined,
  root: string | undefined,
  targetDisabled = false,
): ViteWebCssCompatConfiguration {
  const targets = value === false
    ? undefined
    : resolveTargetSnapshot(value && typeof value === 'object' ? value.policy?.targets : undefined, viteTarget, root, targetDisabled)
  const options = value && typeof value === 'object' && targets
    ? {
        ...value,
        policy: {
          ...value.policy,
          targets: targets.targets,
        },
      }
    : value
  return { options, target: targets }
}

export function resolveViteWebCssCompatConfigurationForTarget(
  value: WebCssCompatUserOptions | undefined,
  build: Pick<import('vite').BuildOptions, 'target' | 'cssTarget'> | undefined,
  root: string | undefined,
): ViteWebCssCompatConfiguration {
  const targetDisabled = build?.cssTarget === false
  const configuredTarget = targetDisabled ? undefined : build?.cssTarget ?? build?.target
  const viteTarget = configuredTarget === undefined
    ? undefined
    : {
        source: build?.cssTarget === undefined ? 'vite-build-target' as const : 'vite-css-target' as const,
        targets: (Array.isArray(configuredTarget) ? configuredTarget : [configuredTarget]).filter((target): target is string => typeof target === 'string'),
      }
  return resolveConfiguration(value, viteTarget, root, targetDisabled)
}

export function resolveViteWebCssCompatOptionsForTarget(
  value: WebCssCompatUserOptions,
  build: Pick<import('vite').BuildOptions, 'target' | 'cssTarget'> | undefined,
  root: string | undefined,
) {
  return resolveViteWebCssCompatConfigurationForTarget(value, build, root).options
}

export function resolveViteWebCssCompatConfiguration(context: ViteFrameworkCssPipelineContext): ViteWebCssCompatConfiguration {
  const value = context.currentGeneratorBranch.isWeb
    ? context.currentGeneratorOptions.webCompat
    : context.currentGeneratorOptions.webCompat ?? true
  return resolveConfiguration(value, context.webCssTarget, context.root, context.webCssTargetDisabled)
}

export function resolveViteWebCssCompatOptions(context: ViteFrameworkCssPipelineContext) {
  return resolveViteWebCssCompatConfiguration(context).options
}

export function transformViteWebCssCompat(
  css: string,
  context: ViteFrameworkCssPipelineContext,
  processing: ViteWebCssCompatProcessing = {},
) {
  const configuration = resolveViteWebCssCompatConfiguration(context)
  const userOnDiagnostic = context.currentGeneratorOptions.styleOptions?.onDiagnostic
  return transformWebCssCompat(css, configuration.options, {
    ...processing,
    ...(configuration.options === false || configuration.options === undefined ? {} : { target: configuration.target }),
    onDiagnostic: (diagnostic) => {
      processing.onDiagnostic?.(diagnostic)
      if (userOnDiagnostic) {
        void userOnDiagnostic({ phase: 'postcss', durationMs: 0, compatibility: diagnostic })
      }
    },
  })
}

export function shouldApplyViteWebCssCompat(
  context: ViteFrameworkCssPipelineContext,
  strategy: ViteFrameworkCssPipelineStrategy | undefined,
) {
  if (strategy?.generation?.shouldApplyWebCssCompat?.(context) !== true) {
    return false
  }
  return !context.currentGeneratorBranch.isWeb
    || context.currentGeneratorOptions.webCompat !== undefined
}
