import { existsSync } from 'node:fs'
import path from 'node:path'

export function resolveExistingConfigPath(
  config: string | undefined,
  configRequest: string | undefined,
  file: string,
  sourceOptions: {
    projectRoot?: string | undefined
    cwd?: string | undefined
    config?: string | undefined
    sourceFile?: string | undefined
    outputRoot?: string | undefined
  },
) {
  if (config && existsSync(config)) {
    return config
  }
  if (!configRequest || path.isAbsolute(configRequest)) {
    return sourceOptions.config
  }

  const outputDir = path.dirname(file.replace(/[?#].*$/, ''))
  const sourceDir = sourceOptions.sourceFile
    ? path.dirname(sourceOptions.sourceFile.replace(/[?#].*$/, ''))
    : undefined
  const baseCandidates = [
    sourceDir,
    path.isAbsolute(outputDir) ? outputDir : undefined,
    sourceOptions.projectRoot,
    sourceOptions.cwd,
  ].filter((item): item is string => typeof item === 'string' && item.length > 0)
  const seenCandidates = new Set<string>()
  const configCandidates: string[] = []
  const addConfigCandidate = (candidate: string | undefined) => {
    if (!candidate) {
      return
    }
    const normalized = path.resolve(candidate)
    if (seenCandidates.has(normalized)) {
      return
    }
    seenCandidates.add(normalized)
    configCandidates.push(normalized)
  }

  for (const base of baseCandidates) {
    addConfigCandidate(path.resolve(base, configRequest))
    if (!path.isAbsolute(outputDir)) {
      addConfigCandidate(path.resolve(base, outputDir, configRequest))
    }
  }

  for (const candidate of configCandidates) {
    if (existsSync(candidate)) {
      return candidate
    }
  }
  return sourceOptions.config
}
