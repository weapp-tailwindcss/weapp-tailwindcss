import { execFile } from 'node:child_process'
import { readFile, realpath } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import semver from 'semver'
import { parseAllDocuments, parse as parseYaml } from 'yaml'
import { repositoryManifest } from '../scripts/ci/version-contract.mjs'

export const TEMPLATE_PACKAGE_MANAGER = repositoryManifest.packageManager

/** 按仓库跟踪范围发现模板，保留缺失文件以便契约检查报错。 */
export async function trackedTemplateManifests(root: string) {
  const { stdout } = await promisify(execFile)('git', ['ls-files', '-z', '--', ':(glob)templates/*/package.json'], { cwd: root })
  return stdout.split('\0').filter(Boolean).map(file => path.resolve(root, file))
}

export function isTemplateVersionCompatible(range: unknown, version: string) {
  return typeof range === 'string'
    && semver.validRange(range) !== null
    && !/\d+\.\d+\.\d+-[\w.-]+/.test(range)
    && semver.valid(version) === version
    && semver.prerelease(version) === null
    && semver.satisfies(version, range)
}

export interface TemplateDependencyContract {
  range: string
  version: string
}

const dependencyFields = ['dependencies', 'devDependencies', 'optionalDependencies'] as const
const packageName = 'weapp-tailwindcss'
interface WorkspaceCatalogs {
  catalog?: Record<string, string>
  catalogs?: Record<string, Record<string, string>>
}

function isRecord(value: unknown): value is Record<string, any> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function dependencyEntries(manifest: Record<string, any>) {
  return dependencyFields.flatMap(field => Object.hasOwn(manifest[field] ?? {}, packageName)
    ? [{ field, value: manifest[field][packageName] }]
    : [])
}

/** 独立模板消费已发布包；工作区候选版本不能替代模板自身的冻结依赖身份。 */
export function parseTemplateDependencyContract(manifest: unknown, lockfile: string, workspace?: unknown): TemplateDependencyContract | undefined {
  try {
    if (!isRecord(manifest)) {
      return undefined
    }
    const declared = dependencyEntries(manifest)
    const documents = parseAllDocuments(lockfile)
    if (documents.some(document => document.errors.length)) {
      return undefined
    }
    const business = documents.map(document => document.toJS()).filter(document =>
      dependencyFields.some(field => document?.importers?.['.']?.[field] !== undefined),
    )
    if (declared.length !== 1 || business.length !== 1) {
      return undefined
    }
    const locked = dependencyEntries(business[0].importers['.'])
    const declaration = declared[0]!
    const entry = locked[0]?.value
    if (locked.length !== 1 || locked[0]!.field !== declaration.field || entry?.specifier !== declaration.value || typeof entry.version !== 'string') {
      return undefined
    }
    let range = declaration.value
    if (range.startsWith('catalog:')) {
      if (!isRecord(workspace)) {
        return undefined
      }
      const catalogs = workspace as WorkspaceCatalogs
      const catalogName = range.slice('catalog:'.length) || 'default'
      const catalog = catalogName === 'default'
        ? catalogs.catalog ?? catalogs.catalogs?.['default']
        : catalogs.catalogs?.[catalogName]
      const catalogRange = catalog?.[packageName]
      if (!catalogRange) {
        return undefined
      }
      const lockedCatalog = business[0].catalogs?.[catalogName]?.[packageName]
      if (lockedCatalog?.specifier !== catalogRange) {
        return undefined
      }
      range = catalogRange
    }
    const version = /^(\d+\.\d+\.\d+)(?:\(.+\))?$/.exec(entry.version)?.[1]
    if (!version || !isTemplateVersionCompatible(range, version)) {
      return undefined
    }
    if (declaration.value.startsWith('catalog:') && business[0].catalogs?.[declaration.value.slice('catalog:'.length) || 'default']?.[packageName]?.version !== version) {
      return undefined
    }
    const resolution = business[0].packages?.[`${packageName}@${version}`]?.resolution
    const snapshot = business[0].snapshots?.[`${packageName}@${entry.version}`]
    if (!isRecord(resolution) || !isRecord(snapshot)
      || Object.hasOwn(resolution, 'tarball') || Object.hasOwn(resolution, 'type')
      || typeof resolution.integrity !== 'string' || !/^sha512-[A-Za-z0-9+/]{86}==$/.test(resolution.integrity)) {
      return undefined
    }
    return { range, version }
  }
  catch {
    return undefined
  }
}

export async function readTemplateDependencyContract(root: string) {
  const [manifest, lockfile, workspace] = await Promise.all([
    readFile(path.join(root, 'package.json'), 'utf8'),
    readFile(path.join(root, 'pnpm-lock.yaml'), 'utf8'),
    readFile(path.join(root, 'pnpm-workspace.yaml'), 'utf8').catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') {
        return undefined
      }
      throw error
    }),
  ])
  const contract = parseTemplateDependencyContract(JSON.parse(manifest), lockfile, workspace ? parseYaml(workspace) : undefined)
  if (!contract) {
    throw new Error(`模板声明与独立锁文件的稳定版依赖不一致：${root}`)
  }
  return contract
}

export async function verifyInstalledTemplateDependency(root: string, contract: TemplateDependencyContract) {
  const modules = path.join(root, 'node_modules')
  const file = path.join(modules, packageName, 'package.json')
  const actualModules = await realpath(modules)
  const relative = path.relative(actualModules, await realpath(file))
  const installed = JSON.parse(await readFile(file, 'utf8'))
  if (actualModules !== path.join(await realpath(root), 'node_modules')
    || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)
    || installed.name !== packageName || installed.version !== contract.version
    || !isTemplateVersionCompatible(contract.range, installed.version)) {
    throw new Error(`模板实际安装依赖与独立锁文件不一致：${root}`)
  }
}
