import type { CliOptions, ConcreteWatchCaseName, DemoWatchShardName, WatchCase } from '../types'
import process from 'node:process'
import { buildDemoCases } from './demo'

export const demoWatchShardCases: Record<DemoWatchShardName, ConcreteWatchCaseName[]> = {
  'demo-core': [
    'gulp-tailwindcss-v4',
    'weapp-vite-tailwindcss-v4',
    'mpx-tailwindcss-v4',
  ],
  'demo-taro-react': [
    'taro-vite-react-tailwindcss-v4',
    'taro-webpack-react-tailwindcss-v4',
  ],
  'demo-taro-vue3': [
    'taro-vite-vue3-tailwindcss-v4',
    'taro-webpack-vue3-tailwindcss-v4',
  ],
  'demo-uni': [
    'uni-app-vite-tailwindcss-v4',
  ],
}

const demoWatchShardNames = new Set<DemoWatchShardName>(Object.keys(demoWatchShardCases) as DemoWatchShardName[])
const defaultDemoWatchCaseNames = new Set<ConcreteWatchCaseName>(Object.values(demoWatchShardCases).flat())
const localOnlyWatchCaseNames = new Set<ConcreteWatchCaseName>([
  'uni-app-vite-vue3-hbuilderx-tailwindcss-v4',
  'uni-app-x-vdom-tailwindcss-v4',
])

export function getBaseWatchCaseName(caseName: CliOptions['caseName']): ConcreteWatchCaseName | undefined {
  if (caseName === 'all' || caseName === 'both' || caseName === 'demo' || isDemoWatchShardName(caseName)) {
    return undefined
  }
  return caseName.split(':', 1)[0] as ConcreteWatchCaseName
}

export function isPlatformWatchCaseName(caseName: CliOptions['caseName']) {
  return Boolean(getBaseWatchCaseName(caseName) && caseName.includes(':'))
}

export function isDemoWatchShardName(caseName: CliOptions['caseName']): caseName is DemoWatchShardName {
  return demoWatchShardNames.has(caseName as DemoWatchShardName)
}

export function filterCasesForPlatform(cases: WatchCase[], _platform: NodeJS.Platform): WatchCase[] {
  return cases
}

export function isLocalOnlyWatchCase(caseName: CliOptions['caseName']) {
  const baseCaseName = getBaseWatchCaseName(caseName)
  return Boolean(baseCaseName && localOnlyWatchCaseNames.has(baseCaseName))
}

export function buildCases(baseCwd: string, options: {
  includeLocalOnly?: boolean
} = {}): WatchCase[] {
  const cases = [
    ...buildDemoCases(baseCwd, options),
  ]

  return filterCasesForPlatform(cases, process.platform)
}

export function pickCases(allCases: WatchCase[], caseName: CliOptions['caseName']) {
  if (caseName === 'all') {
    return allCases
  }

  if (caseName === 'demo') {
    return allCases.filter(item => item.group === caseName && defaultDemoWatchCaseNames.has(item.name))
  }

  if (isDemoWatchShardName(caseName)) {
    const shardCases = new Set(demoWatchShardCases[caseName])
    return allCases.filter(item => shardCases.has(item.name))
  }

  if (caseName === 'both') {
    return allCases.filter(item => item.name === 'taro-webpack-react-tailwindcss-v4' || item.name === 'uni-app-vite-tailwindcss-v4')
  }

  return allCases.filter(item => item.name === caseName)
}
