import type { WatchCase } from '../../types'
import path from 'node:path'
import { buildDemoBaseCases } from './base'
import { buildDemoExtendedCases } from './extended'
import { buildUniAppHBuilderXCases } from './hbuilderx'

function withIconifyHmr(cases: WatchCase[]): WatchCase[] {
  return cases.map(watchCase => ({
    ...watchCase,
    iconifyHmr: watchCase.iconifyHmr ?? {
      sourceFile: watchCase.templateMutation.sourceFile,
    },
    ...(watchCase.webHmr
      ? {
          webHmr: {
            ...watchCase.webHmr,
            iconifyHmr: watchCase.webHmr.iconifyHmr ?? {},
          },
        }
      : {}),
  }))
}

function withFinalStyleIntegrity(cases: WatchCase[]): WatchCase[] {
  return cases.map((watchCase) => {
    const outputIntegrityGuards = [...(watchCase.outputIntegrityGuards ?? [])]
    const styleDirectories = new Set(watchCase.globalStyleCandidates.map(candidate => path.dirname(candidate)))
    for (const directory of styleDirectories) {
      const existingIndex = outputIntegrityGuards.findIndex(guard => guard.directory === directory)
      const existingGuard = outputIntegrityGuards[existingIndex]
      if (existingGuard) {
        outputIntegrityGuards[existingIndex] = {
          ...existingGuard,
          forbidEmptyBlockAtRules: true,
        }
      }
      else {
        outputIntegrityGuards.push({
          directory,
          forbidEmptyBlockAtRules: true,
        })
      }
    }
    return {
      ...watchCase,
      outputIntegrityGuards,
    }
  })
}

export function buildDemoCases(baseCwd: string, options: {
  includeLocalOnly?: boolean
} = {}): WatchCase[] {
  return withIconifyHmr(withFinalStyleIntegrity([
    ...buildDemoBaseCases(baseCwd),
    ...buildDemoExtendedCases(baseCwd),
    ...(options.includeLocalOnly ? buildUniAppHBuilderXCases(baseCwd) : []),
  ]))
}

export { buildUniAppHBuilderXCases }
