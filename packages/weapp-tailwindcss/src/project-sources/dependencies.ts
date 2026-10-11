import path from 'node:path'

export function addSourceScanDependency(dependencies: Set<string>, file: string | undefined) {
  if (typeof file === 'string' && file.length > 0) {
    dependencies.add(path.resolve(file))
  }
}

export function addSourceScanDependencies(dependencies: Set<string>, files: string[] | undefined) {
  for (const file of files ?? []) {
    addSourceScanDependency(dependencies, file)
  }
}
