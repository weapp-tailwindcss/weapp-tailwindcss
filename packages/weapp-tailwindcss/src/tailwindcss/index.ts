import type { PackageJson } from 'pkg-types'
import type { PackageResolvingOptions } from './package-options'
import { getPackageInfoSync } from 'local-pkg'
import { createTailwindcssRuntime } from './runtime-factory'

function getTailwindcssPackageInfo(options?: PackageResolvingOptions) {
  return getPackageInfoSync('tailwindcss', options) as {
    name: string
    version: string | undefined
    rootPath: string
    packageJsonPath: string
    packageJson: PackageJson
  } | undefined
}

export {
  createTailwindcssRuntime,
  getTailwindcssPackageInfo,
}
