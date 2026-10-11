export type AppRenderMode = 'vdom' | 'vapor'

export interface AppRuntimeLogContractSource {
  renderMode?: AppRenderMode
  runtimeLogContains?: Array<string | RegExp>
  runtimeLogNotContains?: Array<string | RegExp>
}

const renderModeLogContracts = {
  vdom: {
    contains: [/VDOM模式/],
    notContains: [/蒸汽模式/],
  },
  vapor: {
    contains: [/蒸汽模式/, /当前视图层编译目标/],
    notContains: [/VDOM模式/],
  },
} satisfies Record<AppRenderMode, {
  contains: RegExp[]
  notContains: RegExp[]
}>

function matchesLogEntry(source: string, entry: string | RegExp) {
  if (typeof entry === 'string') {
    return source.includes(entry)
  }
  entry.lastIndex = 0
  return entry.test(source)
}

export function resolveAppRuntimeLogContract(item: AppRuntimeLogContractSource) {
  const renderModeContract = item.renderMode ? renderModeLogContracts[item.renderMode] : undefined
  return {
    contains: [
      ...(item.runtimeLogContains ?? []),
      ...(renderModeContract?.contains ?? []),
    ],
    notContains: [
      ...(item.runtimeLogNotContains ?? []),
      ...(renderModeContract?.notContains ?? []),
    ],
  }
}

export function findMissingRuntimeLogs(source: string, entries: Array<string | RegExp>) {
  return entries.filter(entry => !matchesLogEntry(source, entry))
}

export function findForbiddenRuntimeLogs(source: string, entries: Array<string | RegExp>) {
  return entries.filter(entry => matchesLogEntry(source, entry))
}
