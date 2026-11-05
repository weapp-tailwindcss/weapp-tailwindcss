import type { PackageJson } from 'pkg-types'
import type { PackageResolvingOptions } from './package-options'
import { getPackageInfoSync } from 'local-pkg'
import { createTailwindcssRuntime } from './runtime-factory'

function getTailwindcssPackageInfo(options?: PackageResolvingOptions): {
  name: string
  version: string | undefined
  rootPath: string
  packageJsonPath: string
  packageJson: PackageJson
} | undefined {
  return getPackageInfoSync('tailwindcss', options)
}

export {
  createTailwindcssRuntime,
  getTailwindcssPackageInfo,
}
