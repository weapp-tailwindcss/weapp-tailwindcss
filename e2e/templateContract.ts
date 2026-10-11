import { execFile } from 'node:child_process'
import path from 'node:path'
import { promisify } from 'node:util'
import semver from 'semver'
import packageManifest from '../packages/weapp-tailwindcss/package.json'
import { repositoryManifest } from '../scripts/ci/version-contract.mjs'

export const TEMPLATE_PACKAGE_MANAGER = repositoryManifest.packageManager

/** 按仓库跟踪范围发现模板，保留缺失文件以便契约检查报错。 */
export async function trackedTemplateManifests(root: string) {
  const { stdout } = await promisify(execFile)('git', ['ls-files', '-z', '--', ':(glob)templates/*/package.json'], { cwd: root })
  return stdout.split('\0').filter(Boolean).map(file => path.resolve(root, file))
}

export function isTemplateVersionCompatible(range: unknown) {
  return typeof range === 'string' && semver.validRange(range) !== null && semver.satisfies(packageManifest.version, range)
}
