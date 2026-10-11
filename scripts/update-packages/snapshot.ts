import { readFile, realpath } from 'node:fs/promises'
import path from 'node:path'
import { clearWorkspaceCache, getWorkspacePackages } from 'repoctl'
import YAML from 'yaml'

const sections = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'] as const
type Section = typeof sections[number]
type Manifest = Partial<Record<Section, Record<string, string>>>
type Importer = Partial<Record<Section, Record<string, { version?: string }>>>
interface Lockfile {
  importers?: Record<string, Importer & { packageManagerDependencies?: unknown, configDependencies?: unknown }>
}
interface Workspace {
  catalog?: Record<string, string>
  catalogs?: Record<string, Record<string, string>>
}

export interface DependencyState {
  declaration: string
  range: string
  resolved?: string | undefined
}

interface PackageState {
  name: string
  dependencies: Map<string, { section: Section, name: string, state: DependencyState }>
}

export type Snapshot = Map<string, PackageState>

export interface PackageChange {
  name: string
  dependencies: {
    section: Section
    name: string
    before?: DependencyState | undefined
    after?: DependencyState | undefined
  }[]
}

/** 仅在锁文件 importer 身份边界，把文件系统相对路径转换成逻辑路径。 */
export function importerKey(root: string, dir: string, paths = path): string {
  return paths.relative(root, paths.resolve(root, dir)).split(paths.sep).join('/') || '.'
}

async function readLockfile(root: string): Promise<Lockfile> {
  let source: string
  try {
    source = await readFile(path.join(root, 'pnpm-lock.yaml'), 'utf8')
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return {}
    }
    throw error
  }
  const documents = YAML.parseAllDocuments(source).map((document) => {
    if (document.errors.length) {
      throw document.errors[0]
    }
    return document.toJS() as Lockfile | null
  })
  // pnpm 12 把自身工具链放在独立文档中，不能将其当作项目依赖。
  const projects = documents.filter((document): document is Lockfile => {
    if (!document?.importers) {
      return false
    }
    return !Object.values(document.importers).some(importer => (
      importer.packageManagerDependencies !== undefined || importer.configDependencies !== undefined
    ))
  })
  if (projects.length > 1) {
    throw new Error('pnpm-lock.yaml 包含多个项目依赖文档，无法确定更新范围')
  }
  return projects[0] ?? {}
}

function resolveRange(workspace: Workspace, name: string, declaration: string): string {
  if (!declaration.startsWith('catalog:')) {
    return declaration
  }
  const catalogName = declaration.slice('catalog:'.length) || 'default'
  const catalog = catalogName === 'default'
    ? workspace.catalog ?? workspace.catalogs?.['default']
    : workspace.catalogs?.[catalogName]
  const range = catalog?.[name]
  if (!range) {
    throw new Error(`无法解析依赖 ${name} 的 ${declaration}`)
  }
  return range
}

export async function readSnapshot(root: string): Promise<Snapshot> {
  root = await realpath(path.resolve(root))
  clearWorkspaceCache()
  const [packages, lockfile, workspaceSource] = await Promise.all([
    getWorkspacePackages(root),
    readLockfile(root),
    readFile(path.join(root, 'pnpm-workspace.yaml'), 'utf8'),
  ])
  const workspace = YAML.parse(workspaceSource) as Workspace
  const snapshot: Snapshot = new Map()
  for (const pkg of packages) {
    const parent = path.relative(root, path.dirname(pkg.rootDir))
    if (!['packages', 'packages-runtime'].includes(parent) || !pkg.manifest.name || pkg.manifest.private) {
      continue
    }
    const manifest = JSON.parse(await readFile(pkg.pkgJsonPath, 'utf8')) as Manifest
    const importer = lockfile.importers?.[importerKey(root, pkg.rootDir)]
    const dependencies: PackageState['dependencies'] = new Map()
    for (const section of sections) {
      for (const [name, declaration] of Object.entries(manifest[section] ?? {})) {
        dependencies.set(`${section}:${name}`, {
          section,
          name,
          state: {
            declaration,
            range: resolveRange(workspace, name, declaration),
            resolved: importer?.[section]?.[name]?.version
              ?? (section === 'peerDependencies' ? importer?.dependencies?.[name]?.version ?? importer?.devDependencies?.[name]?.version : undefined),
          },
        })
      }
    }
    snapshot.set(pkg.manifest.name, { name: pkg.manifest.name, dependencies })
  }
  return snapshot
}

export function compareSnapshots(before: Snapshot, after: Snapshot): PackageChange[] {
  const changes: PackageChange[] = []
  for (const [name, current] of [...after].sort(([a], [b]) => a.localeCompare(b))) {
    const previous = before.get(name)
    const dependencies: PackageChange['dependencies'] = []
    const keys = new Set([...previous?.dependencies.keys() ?? [], ...current.dependencies.keys()])
    for (const key of [...keys].sort()) {
      const oldDependency = previous?.dependencies.get(key)
      const newDependency = current.dependencies.get(key)
      if (JSON.stringify(oldDependency?.state) === JSON.stringify(newDependency?.state)) {
        continue
      }
      const dependency = newDependency ?? oldDependency!
      dependencies.push({ section: dependency.section, name: dependency.name, before: oldDependency?.state, after: newDependency?.state })
    }
    if (dependencies.length) {
      changes.push({ name, dependencies })
    }
  }
  return changes
}
