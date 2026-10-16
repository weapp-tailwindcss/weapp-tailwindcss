import type { ShowcaseCatalog } from '../src/components/docs/showcase/types'
import { mkdir, mkdtemp, readdir, readFile, readlink, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach } from 'vitest'
import { renderShowcaseCatalog } from '../../scripts/showcase/render'

const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

export function comment(id: number, name = `Example ${id}`, images = ['first.png', 'second.png']) {
  return {
    id,
    body: [`小程序名称: ${name}`, '介绍: 保留中文描述。', ...images.map(image => `![${image}](https://images.invalid/${id}/${image})`)].join('\n'),
    user: { login: 'example', html_url: 'https://github.com/example' },
    created_at: `2026-10-${id === 1 ? '01' : '02'}T00:00:00Z`,
    html_url: `https://github.com/example/repo/issues/1#issuecomment-${id}`,
  }
}

export const issue = { title: 'Examples', html_url: 'https://github.com/example/repo/issues/1', updated_at: '2026-10-16T00:00:00Z' }

export async function fixture(ids = [1]) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'showcase-generation-'))
  roots.push(root)
  const imageRoot = path.join(root, 'website', 'static', 'img', 'showcase')
  const catalogFile = path.join(root, 'website', 'src', 'components', 'docs', 'showcase', 'catalog.json')
  const markdownFile = path.join(root, 'website', 'docs', 'showcase', 'index.mdx')
  const englishFile = path.join(root, 'website', 'i18n', 'en', 'docusaurus-plugin-content-docs', 'current', 'showcase', 'index.mdx')
  const configFile = path.join(path.dirname(markdownFile), 'config.json')
  for (const directory of [imageRoot, path.dirname(catalogFile), path.dirname(markdownFile), path.dirname(englishFile)]) {
    await mkdir(directory, { recursive: true })
  }
  const catalog = renderShowcaseCatalog(issue.html_url, ids.map(id => ({
    id,
    name: `Old ${id}`,
    createdAt: '2026-10-01T00:00:00Z',
    commentUrl: `${issue.html_url}#issuecomment-${id}`,
    author: comment(id).user,
    images: ['code.png', 'screen.png'].map(name => ({ src: `/img/showcase/old-${id}/${name}`, alt: name })),
  })), 'old-generation')
  for (const id of ids) {
    await mkdir(path.join(imageRoot, `old-${id}`))
    for (const name of ['code.png', 'screen.png']) {
      await writeFile(path.join(imageRoot, `old-${id}`, name), `${id}:${name}:old`)
    }
  }
  await writeFile(catalogFile, JSON.stringify(catalog))
  await writeFile(markdownFile, 'old-markdown')
  async function translations(eligible: number[]) {
    await writeFile(path.join(path.dirname(catalogFile), 'en.json'), JSON.stringify(Object.fromEntries(eligible.map(id => [id, { title: `Example ${id}` }]))))
    await writeFile(englishFile, eligible.map(id => `<ShowcaseCard entryId="${id}">English description.</ShowcaseCard>`).join('\n'))
  }
  await translations(ids)
  return { root, imageRoot, catalogFile, markdownFile, englishFile, configFile, catalog, translations, skipImages: false }
}

export async function tree(root: string): Promise<Record<string, string>> {
  const result: Record<string, string> = {}
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const file = path.join(root, entry.name)
    if (entry.isSymbolicLink()) {
      result[entry.name] = `symlink:${await readlink(file)}`
    }
    else if (entry.isDirectory()) {
      for (const [name, bytes] of Object.entries(await tree(file))) {
        result[path.join(entry.name, name)] = bytes
      }
    }
    else {
      result[entry.name] = (await readFile(file)).toString('base64')
    }
  }
  return result
}

export async function catalogAt(file: string): Promise<ShowcaseCatalog> {
  return JSON.parse(await readFile(file, 'utf8'))
}

export async function download(image: { url: string, alt?: string }, directory: string, name: string, index: number) {
  const filename = `${index + 1}.png`
  const localPath = path.join(directory, filename)
  await writeFile(localPath, image.url)
  return { alt: image.alt ?? '', src: `/img/showcase/${name}/${filename}`, originUrl: image.url, downloaded: true, localPath }
}
