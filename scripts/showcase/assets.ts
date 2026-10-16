import type { ShowcaseCatalog, ShowcaseImage } from '../../website/src/components/docs/showcase/types'
import { realpath, stat } from 'node:fs/promises'
import path from 'node:path'

function inside(root: string, file: string, paths: typeof path) {
  const relative = paths.relative(root, file)
  return relative !== '..' && !relative.startsWith(`..${paths.sep}`) && !paths.isAbsolute(relative)
}

/** URL 仅在本地图片边界解码一次，文件系统部分交给对应平台的路径 API。 */
export function resolveShowcaseImage(imageRoot: string, src: string, paths: typeof path = path) {
  const prefix = '/img/showcase/'
  if (!src.startsWith(prefix)) {
    throw new Error(`Showcase 资源不属于本地 static：${src}`)
  }
  const url = new URL(src, 'https://showcase.invalid')
  if (url.origin !== 'https://showcase.invalid' || !url.pathname.startsWith(prefix)) {
    throw new Error(`Showcase 资源不属于本地 static：${src}`)
  }
  const root = paths.resolve(imageRoot)
  const file = paths.resolve(root, ...decodeURIComponent(url.pathname.slice(prefix.length)).split('/').filter(Boolean))
  if (!inside(root, file, paths)) {
    throw new Error(`Showcase 资源越出 static：${src}`)
  }
  return file
}

/** 同时检查逻辑路径和真实文件归属，拒绝缺图、空文件与越界符号链接。 */
export async function verifyShowcaseImages(imageRoot: string, images: readonly ShowcaseImage[]) {
  const root = await realpath(imageRoot)
  return await Promise.all(images.map(async (image) => {
    const file = await realpath(resolveShowcaseImage(root, image.src))
    const info = await stat(file)
    if (!inside(root, file, path) || !info.isFile() || info.size === 0) {
      throw new Error(`Showcase 图片不是本地有效文件：${image.src}`)
    }
    return { ...image, localPath: file }
  }))
}

/** 只按稳定评论 ID 复用已发布的图片选择，不用名称、排序或远端文件名猜测对应关系。 */
export async function reuseShowcaseImages(catalog: ShowcaseCatalog, id: number, imageRoot: string) {
  const matches = catalog.entries.filter(entry => entry.id === String(id))
  if (matches.length !== 1) {
    throw new Error(`Showcase 跳过下载时没有唯一的已发布案例：${id}；请先完整下载生成。`)
  }
  const entry = matches[0]!
  const images = [entry.primaryImage, ...entry.screenshots]
  return (await verifyShowcaseImages(imageRoot, images)).map(image => ({
    ...image,
    alt: image.alt ?? '',
    originUrl: image.src,
    downloaded: false,
  }))
}
