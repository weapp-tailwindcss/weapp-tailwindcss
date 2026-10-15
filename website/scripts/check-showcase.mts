import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { getShowcaseDescriptionIds, validateShowcaseLocalization } from '../../scripts/showcase/render'
import { showcaseCatalog, showcaseEnglish } from '../src/components/docs/showcase/catalog'

/** URL 路径仅在 static 资源边界解码一次，再交给平台路径 API。 */
export function resolveShowcaseAsset(staticRoot: string, src: string, paths: typeof path = path) {
  const url = new URL(src, 'https://showcase.invalid')
  if (url.origin !== 'https://showcase.invalid' || !url.pathname.startsWith('/img/showcase/')) {
    throw new Error(`Showcase 资源不属于本地 static：${src}`)
  }
  const file = paths.resolve(staticRoot, ...decodeURIComponent(url.pathname).split('/').filter(Boolean))
  const relative = paths.relative(staticRoot, file)
  if (relative === '..' || relative.startsWith(`..${paths.sep}`) || paths.isAbsolute(relative)) {
    throw new Error(`Showcase 资源越出 static：${src}`)
  }
  return file
}

export async function checkShowcase(websiteRoot = fileURLToPath(new URL('..', import.meta.url))) {
  const ids = showcaseCatalog.entries.map(entry => entry.id)
  const files = [
    path.join(websiteRoot, 'docs', 'showcase', 'index.mdx'),
    path.join(websiteRoot, 'i18n', 'en', 'docusaurus-plugin-content-docs', 'current', 'showcase', 'index.mdx'),
  ]
  const [chinese, english] = await Promise.all(files.map(file => readFile(file, 'utf8')))
  const requiredDescriptionIds = getShowcaseDescriptionIds(chinese)
  for (const markdown of [chinese, english]) {
    validateShowcaseLocalization(ids, showcaseEnglish, markdown, requiredDescriptionIds)
  }
  for (const entry of showcaseCatalog.entries) {
    for (const image of [entry.primaryImage, ...entry.screenshots]) {
      const file = resolveShowcaseAsset(path.join(websiteRoot, 'static'), image.src)
      if (!(await stat(file)).isFile()) {
        throw new Error(`Showcase 资源不是文件：${file}`)
      }
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await checkShowcase()
  console.log(`Showcase 共享数据、双语描述与图片有效：${showcaseCatalog.entries.length} 个案例。`)
}
