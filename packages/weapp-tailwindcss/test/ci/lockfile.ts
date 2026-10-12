import YAML from 'yaml'

interface WorkspaceLockfile extends Record<string, unknown> {
  settings: Record<string, unknown>
  importers: Record<string, unknown>
}

function isMapping(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function parseWorkspaceLockfile(source: string): WorkspaceLockfile {
  const documents = YAML.parseAllDocuments(source).map((document): unknown => {
    if (document.errors.length) {
      throw document.errors[0]
    }
    return document.toJS()
  })
  // pnpm 的工具依赖和项目依赖分段保存，按安装设置与项目映射识别唯一项目文档。
  const workspaces = documents.filter((document): document is WorkspaceLockfile =>
    isMapping(document) && isMapping(document.settings) && isMapping(document.importers),
  )
  if (workspaces.length !== 1) {
    throw new Error(`Expected one workspace lockfile document, received ${workspaces.length}`)
  }
  return workspaces[0]!
}
