import { createHash } from 'node:crypto'
import { lstat, readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defaultSiteLocale, siteLocales } from '../src/i18n/locale'

const defaultBuildDirectory = fileURLToPath(new URL('../build', import.meta.url))

export interface HashedDeploymentAsset {
  pathname: string
  sha256: string
}

export function digest(content: Uint8Array) {
  return createHash('sha256').update(content).digest('hex')
}

/** 仅在文件系统路径转换为请求 URL 的边界编码各个路径片段。 */
export function deploymentAssetPathname(buildDirectory: string, filename: string, paths = path) {
  const relative = paths.relative(paths.resolve(buildDirectory), paths.resolve(filename))
  if (!relative || relative === '..' || relative.startsWith(`..${paths.sep}`) || paths.isAbsolute(relative)) {
    throw new Error(`Deployment asset is outside the build directory: ${filename}`)
  }
  return `/${relative.split(paths.sep).map(segment => encodeURIComponent(segment)).join('/')}`
}

async function requireRealDirectory(directory: string) {
  if (!(await lstat(directory)).isDirectory()) {
    throw new Error(`Deployment asset directory must be a real directory: ${directory}`)
  }
}

async function collectAssetFiles(directory: string): Promise<string[]> {
  await requireRealDirectory(directory)
  const files: string[] = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      files.push(...await collectAssetFiles(filename))
    }
    else if (entry.isFile()) {
      files.push(filename)
    }
    else {
      throw new Error(`Deployment asset must be a regular file or directory: ${filename}`)
    }
  }
  return files
}

export async function getExpectedHashedAssets(buildDirectory = defaultBuildDirectory): Promise<HashedDeploymentAsset[]> {
  const files: string[] = []
  for (const locale of siteLocales) {
    const directory = locale === defaultSiteLocale ? buildDirectory : path.join(buildDirectory, locale)
    await requireRealDirectory(directory)
    await requireRealDirectory(path.join(directory, 'img'))
    await requireRealDirectory(path.join(directory, 'img', 'social'))
    files.push(
      ...await collectAssetFiles(path.join(directory, 'assets')),
      path.join(directory, 'img', 'social', 'weapp-tailwindcss-en.png'),
      path.join(directory, 'img', 'social', 'weapp-tailwindcss-zh-cn.png'),
    )
  }
  const assets: HashedDeploymentAsset[] = []
  for (const filename of files) {
    if (!(await lstat(filename)).isFile()) {
      throw new Error(`Deployment asset must be a regular file: ${filename}`)
    }
    assets.push({ pathname: deploymentAssetPathname(buildDirectory, filename), sha256: digest(await readFile(filename)) })
  }
  return assets.sort((left, right) => left.pathname.localeCompare(right.pathname, 'en'))
}
