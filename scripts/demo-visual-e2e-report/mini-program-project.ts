import fs from 'node:fs/promises'
import path from 'node:path'

export interface MiniProgramProject {
  projectPath: string
  miniprogramRoot: string
}

/** IDE 项目目录与小程序运行时根分别解析；缺省根遵循 project.config.json 的当前目录语义。 */
export function resolveMiniProgramProjectRoots(projectPath: string, configuredRoot?: string, paths: typeof path.posix = path): MiniProgramProject {
  return {
    projectPath: paths.resolve(projectPath),
    miniprogramRoot: paths.resolve(projectPath, configuredRoot || '.'),
  }
}

export function isMiniProgramOutputInside(project: MiniProgramProject, outputFile: string, paths: typeof path.posix = path) {
  const relative = paths.relative(project.miniprogramRoot, paths.resolve(outputFile))
  return relative !== '..' && !relative.startsWith(`..${paths.sep}`) && !paths.isAbsolute(relative)
}

export async function readMiniProgramProject(projectPath: string): Promise<MiniProgramProject | undefined> {
  const configFile = path.resolve(projectPath, 'project.config.json')
  let source: string
  try {
    source = await fs.readFile(configFile, 'utf8')
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return undefined
    }
    throw error
  }
  const config: unknown = JSON.parse(source)
  if (config === null || typeof config !== 'object' || Array.isArray(config)) {
    throw new Error(`Invalid mini-program project config: ${configFile}`)
  }
  const configuredRoot = 'miniprogramRoot' in config ? config.miniprogramRoot : undefined
  if (configuredRoot !== undefined && typeof configuredRoot !== 'string') {
    throw new Error(`Invalid miniprogramRoot in ${configFile}: expected a string`)
  }
  return resolveMiniProgramProjectRoots(projectPath, configuredRoot)
}

/** 仅选择运行时产物根覆盖当前 watch 输出的配置，源码根不能替代运行时根。 */
export async function resolveMiniProgramWatchProject(outputFile: string, candidates: readonly string[]): Promise<MiniProgramProject> {
  const visited = new Set<string>()
  async function readCandidate(candidate: string) {
    const normalized = path.resolve(candidate)
    if (visited.has(normalized)) {
      return undefined
    }
    visited.add(normalized)
    const project = await readMiniProgramProject(normalized)
    return project && isMiniProgramOutputInside(project, outputFile) ? project : undefined
  }

  for (const candidate of candidates) {
    const project = await readCandidate(candidate)
    if (project) {
      return project
    }
  }
  let current = path.dirname(path.resolve(outputFile))
  while (true) {
    const project = await readCandidate(current)
    if (project) {
      return project
    }
    const parent = path.dirname(current)
    if (parent === current) {
      throw new Error(`No project.config.json miniprogramRoot covers watch output: ${outputFile}`)
    }
    current = parent
  }
}
