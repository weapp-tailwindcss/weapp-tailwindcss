import type { FrameworkBuildFacts } from '@/bundlers/vite/shared/framework-services'
import path from 'node:path'
import process from 'node:process'
import { collectCssReferenceDirectives } from '@weapp-tailwindcss/postcss/transform'
import { cleanUrl, normalizePath } from '@/bundlers/vite/utils'
import {
  collectUniAppXHarmonyApplyStyleSourcesFromSource,
  collectUniAppXHarmonyApplyUtilitiesFromSources,
  createUniAppXHarmonyApplyGeneratorSource,
  expandUniAppXHarmonyApplyStyles,
} from '../style-asset'

interface HarmonyApplyHookContext {
  addWatchFile?: (id: string) => void
}

interface CreateUniAppXHarmonyApplyExpanderOptions {
  generateCss?: ((id: string, code: string, hookContext?: HarmonyApplyHookContext & {
    disableSourceScan?: boolean
    sourceCandidates?: Iterable<string>
    transient?: boolean
  }) => Promise<string | undefined> | string | undefined) | undefined
  getResolvedConfig: () => FrameworkBuildFacts | undefined
  isHarmonyBuildTarget: () => boolean
  transformCss: (css: string, id: string) => Promise<string>
}

function createStableHash(input: string) {
  let hash = 2166136261
  for (let index = 0; index < input.length; index++) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

export function createUniAppXHarmonyApplyExpander(options: CreateUniAppXHarmonyApplyExpanderOptions) {
  interface Snapshot { sources: Set<string>, references: Set<string>, utilities: Set<string> }
  interface SourceState { complete?: Snapshot, requests: Map<string, Snapshot> }
  const sourceStates = new Map<string, SourceState>()
  const sourceKey = (id: string) => normalizePath(cleanUrl(id))

  function createSnapshot(codes: Iterable<string>, id: string): Snapshot {
    const sources = new Set<string>()
    const references = new Set<string>()
    const utilities = new Set<string>()
    for (const code of codes) {
      for (const source of collectUniAppXHarmonyApplyStyleSourcesFromSource(code, id)) {
        sources.add(source)
        for (const reference of collectCssReferenceDirectives(source)) {
          references.add(reference)
        }
        for (const utility of collectUniAppXHarmonyApplyUtilitiesFromSources([source])) {
          utilities.add(utility)
        }
      }
    }
    return { sources, references, utilities }
  }

  function rememberSfc(source: string, output: string, id: string) {
    sourceStates.set(sourceKey(id), { complete: createSnapshot([source, output], id), requests: new Map() })
  }

  function rememberSource(code: string, id: string, authoritative = false) {
    if (authoritative) {
      rememberSfc(code, code, id)
      return
    }
    const key = sourceKey(id)
    const state = sourceStates.get(key) ?? { requests: new Map<string, Snapshot>() }
    // 子请求只提供无完整 SFC 时的来源，不能重建已删除的权威规则。
    if (!state.complete) {
      state.requests.set(normalizePath(id), createSnapshot([code], id))
      sourceStates.set(key, state)
    }
  }

  function getSources(moduleIds?: Iterable<string>) {
    const included = moduleIds ? new Set([...moduleIds].map(sourceKey)) : undefined
    const sources = new Set<string>()
    const utilities = new Set<string>()
    for (const [id, state] of sourceStates) {
      if (included && !included.has(id)) {
        continue
      }
      for (const snapshot of state.complete ? [state.complete] : state.requests.values()) {
        for (const source of snapshot.sources) {
          sources.add(source)
        }
        for (const utility of snapshot.utilities) {
          utilities.add(utility)
        }
      }
    }
    return { sources, utilities, hasSourceSnapshots: sourceStates.size > 0 }
  }

  function prepareStyles(code: string, id: string, authorSource?: string) {
    if (!code.includes('@apply') || code.includes('@reference')) {
      return code
    }
    const state = sourceStates.get(sourceKey(id))
    const snapshots = authorSource !== undefined
      ? [createSnapshot([authorSource], id)]
      : state?.complete ? [state.complete] : [...state?.requests.values() ?? []]
    const references = new Set(snapshots.flatMap(snapshot => [...snapshot.references]))
    if (references.size !== 1) {
      return code
    }
    return `${references.values().next().value}\n${code}`
  }

  async function expandStyles(code: string, id: string, hookContext: HarmonyApplyHookContext, authorSource?: string) {
    if (!options.isHarmonyBuildTarget() || !code.includes('@apply')) {
      return code
    }
    const sources = collectUniAppXHarmonyApplyStyleSourcesFromSource(prepareStyles(code, id, authorSource), id)
    const sourceUtilities = collectUniAppXHarmonyApplyUtilitiesFromSources(sources)
    if (sources.length === 0 || sourceUtilities.size === 0) {
      return code
    }
    const cssFile = path.resolve(
      options.getResolvedConfig()?.root ?? process.cwd(),
      `uni-app-x-harmony-apply-${createStableHash(normalizePath(cleanUrl(id)))}.css`,
    )
    const generatorSource = createUniAppXHarmonyApplyGeneratorSource(sources, sourceUtilities)
    const generatedCss = await options.generateCss?.(
      cssFile,
      generatorSource,
      {
        ...(hookContext.addWatchFile ? { addWatchFile: hookContext.addWatchFile.bind(hookContext) } : {}),
        disableSourceScan: true,
        sourceCandidates: [],
        transient: true,
      },
    )
    if (typeof generatedCss !== 'string' || generatedCss.trim().length === 0) {
      return code
    }
    return expandUniAppXHarmonyApplyStyles(code, await options.transformCss(generatedCss, id))
  }

  return {
    expandStyles,
    prepareStyles,
    rememberSource,
    rememberSfc,
    getSources,
    forgetSource(id: string) {
      // 空权威快照阻止晚到的旧 style 子请求重新发布该文件。
      rememberSfc('', '', id)
    },
  }
}
