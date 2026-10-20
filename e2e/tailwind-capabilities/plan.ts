import { browserEngines } from './types'

export const executionTargets = ['static', 'authoring', ...browserEngines.map(engine => `web-${engine}` as const), ...browserEngines.map(engine => `expo-${engine}` as const), 'weapp', 'react-native-android', 'react-native-ios', 'lynx-android', 'lynx-ios', 'mini-builds', 'framework-regressions'] as const
export type ExecutionTarget = typeof executionTargets[number]

/** 按实际案例 ID 选择 Web 分组，避免把正则源码当成能力名称判断。 */
export function selectWebGroups(caseFilter: RegExp | undefined, authoredIds: readonly string[], registryIds: readonly string[]) {
  return selectCaseGroups(caseFilter, { authored: authoredIds, registry: registryIds })
}

export function selectCaseGroups<T extends string>(caseFilter: RegExp | undefined, groups: Record<T, readonly string[]>): Record<T, boolean> {
  const matches = (ids: readonly string[]) => ids.some(id => !caseFilter || new RegExp(caseFilter.source, caseFilter.flags).test(id))
  const selected = Object.fromEntries(Object.entries<readonly string[]>(groups).map(([name, ids]) => [name, matches(ids)])) as Record<T, boolean>
  if (!Object.values(selected).some(Boolean)) {
    throw new Error('Web 过滤条件没有匹配任何案例')
  }
  return selected
}

export function parseOptions(argv: string[]) {
  let preflightReport: string | undefined
  let caseFilter: RegExp | undefined
  let targets: ExecutionTarget[] = [...executionTargets]
  let list = false
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index]
    if (argument === '--list') {
      list = true
      continue
    }
    if (!['--preflight-report', '--target', '--case'].includes(argument!)) {
      throw new Error(`未知参数 ${argument}；支持 --preflight-report、--target、--case、--list`)
    }
    const value = argv[++index]
    if (!value || value.startsWith('--')) {
      throw new Error(`${argument} 需要参数`)
    }
    if (argument === '--preflight-report') {
      preflightReport = value
    }
    else if (argument === '--case') {
      caseFilter = new RegExp(value)
    }
    else {
      const requested = value.split(',')
      if (new Set(requested).size !== requested.length || requested.some(item => !executionTargets.includes(item as ExecutionTarget))) {
        throw new Error(`未知或重复目标：${value}`)
      }
      targets = requested as ExecutionTarget[]
    }
  }
  if (!list && !preflightReport) {
    throw new Error('缺少 --preflight-report；必须先完成本轮 prepare --extended、computer use 和 verify')
  }
  return { preflightReport, caseFilter, targets, list }
}

export function stageName(target: ExecutionTarget) {
  if (target.startsWith('react-native-') || target.startsWith('expo-')) {
    return `React Native ${target.startsWith('expo-') ? 'web' : target.slice('react-native-'.length)}`
  }
  if (target.startsWith('lynx-')) {
    return `Lynx ${target.slice('lynx-'.length)}`
  }
  return target === 'mini-builds' || target === 'framework-regressions' ? 'weapp web framework matrix' : target
}
