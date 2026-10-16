import { readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { resolveShowcaseImage, verifyShowcaseImages } from '../../scripts/showcase/assets'
import { getShowcaseDescriptionIds, validateShowcaseLocalization } from '../../scripts/showcase/render'
import { showcaseCatalog, showcaseEnglish } from '../src/components/docs/showcase/catalog'

/** URL 路径仅在 static 资源边界解码一次，再交给平台路径 API。 */
export function resolveShowcaseAsset(staticRoot: string, src: string, paths: typeof path = path) {
  return resolveShowcaseImage(paths.resolve(staticRoot, 'img', 'showcase'), src, paths)
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
  await verifyShowcaseImages(path.join(websiteRoot, 'static', 'img', 'showcase'), showcaseCatalog.entries.flatMap(entry => [entry.primaryImage, ...entry.screenshots]))
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await checkShowcase()
  console.log(`Showcase 共享数据、双语描述与图片有效：${showcaseCatalog.entries.length} 个案例。`)
}
