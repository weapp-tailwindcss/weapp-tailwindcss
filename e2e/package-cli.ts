import type { PlatformPath } from 'node:path'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'

interface PackageManifest {
  bin?: string | Record<string, string>
}

/** 根据实际安装包的 bin 元数据解析入口，避免临时项目借用不可迁移的 .bin 包装脚本。 */
export function resolvePackageBin(packageJson: string, manifest: PackageManifest, command: string, paths: PlatformPath = path) {
  const entry = typeof manifest.bin === 'string' ? manifest.bin : manifest.bin?.[command]
  if (!entry) {
    throw new Error(`包 ${packageJson} 没有声明 ${command} CLI 入口。`)
  }
  return paths.resolve(paths.dirname(packageJson), entry)
}

export async function resolveProjectBin(projectRoot: string, packageName: string, command: string) {
  const require = createRequire(path.join(projectRoot, 'package.json'))
  const packageJson = require.resolve(`${packageName}/package.json`)
  const manifest = JSON.parse(await readFile(packageJson, 'utf8')) as PackageManifest
  return resolvePackageBin(packageJson, manifest, command)
}
