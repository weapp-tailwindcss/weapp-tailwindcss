import { isScalar, isSeq, parseDocument } from 'yaml'

export interface ManagedPackageVersion {
  name: string
  version: string
}

export interface TemplateWorkspaceConfigUpdate {
  changed: boolean
  content: string
}

function packageNameFromSpecifier(specifier: string): string | null {
  const separatorIndex = specifier.startsWith('@')
    ? specifier.indexOf('@', specifier.indexOf('/') + 1)
    : specifier.lastIndexOf('@')

  return separatorIndex > 0 ? specifier.slice(0, separatorIndex) : null
}

export function updateTemplateWorkspaceConfig(
  source: string,
  managedPackages: ManagedPackageVersion[],
  requiredExcludes: string[] = [],
): TemplateWorkspaceConfigUpdate {
  const document = parseDocument(source)
  if (document.errors.length > 0) {
    throw document.errors[0]
  }

  const versions = new Map(managedPackages.map(item => [item.name, item.version]))
  const excludes = document.get('minimumReleaseAgeExclude', true)
  if (!isSeq(excludes)) {
    return { changed: false, content: source }
  }

  let changed = false
  const presentPackages = new Set<string>()
  const presentSpecifiers = new Set<string>()
  for (const item of excludes.items) {
    if (!isScalar(item) || typeof item.value !== 'string') {
      continue
    }
    presentSpecifiers.add(item.value)
    const packageName = packageNameFromSpecifier(item.value)
    const version = packageName ? versions.get(packageName) : undefined
    if (!packageName || !version) {
      continue
    }
    presentPackages.add(packageName)
    const next = `${packageName}@${version}`
    if (item.value !== next) {
      item.value = next
      changed = true
    }
  }

  for (const { name, version } of managedPackages) {
    if (!presentPackages.has(name)) {
      excludes.add(`${name}@${version}`)
      changed = true
    }
  }

  for (const specifier of requiredExcludes) {
    if (!presentSpecifiers.has(specifier)) {
      excludes.add(specifier)
      changed = true
    }
  }

  return {
    changed,
    content: changed ? document.toString() : source,
  }
}
