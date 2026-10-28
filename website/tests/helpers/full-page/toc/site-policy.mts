import type { TocOptions } from './observe'
import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

interface ContentMetadata {
  permalink?: unknown
  source?: unknown
  frontMatter?: { toc_min_heading_level?: unknown, toc_max_heading_level?: unknown }
}

function routeKey(pathname: string) {
  return new URL(pathname, 'https://toc-metadata.invalid').pathname.replace(/\/$/, '') || '/'
}

/** 只解析本次构建生成的纯 JSON 配置，不执行配置模块或猜测页面 frontmatter。 */
export async function readWebsiteTocMetadata(websiteRoot: string) {
  const directory = path.join(websiteRoot, '.docusaurus')
  const source = await readFile(path.join(directory, 'docusaurus.config.mjs'), 'utf8')
  const match = /\bexport default (\{[\s\S]*\});?\s*$/.exec(source)
  if (!match) {
    throw new Error('TOC 无法读取准确构建的 Docusaurus 纯 JSON 配置')
  }
  let config
  try {
    config = JSON.parse(match[1]!)
  }
  catch (cause) {
    throw new Error('TOC 无法读取准确构建的 Docusaurus 纯 JSON 配置', { cause })
  }
  const navbar = config.themeConfig?.navbar
  const defaults = config.themeConfig?.tableOfContents
  if (typeof navbar?.hideOnScroll !== 'boolean' || !defaults
    || !Number.isInteger(defaults.minHeadingLevel) || !Number.isInteger(defaults.maxHeadingLevel)
    || defaults.minHeadingLevel < 1 || defaults.maxHeadingLevel > 6 || defaults.minHeadingLevel > defaults.maxHeadingLevel) {
    throw new Error('TOC 构建配置缺少明确的 navbar 或 heading 策略')
  }
  const policies = new Map<string, TocOptions>()
  const files = [{ file: path.relative(websiteRoot, path.join(directory, 'docusaurus.config.mjs')), bytes: source }]
  const visit = async (folder: string) => {
    for (const entry of await readdir(folder, { withFileTypes: true })) {
      const target = path.join(folder, entry.name)
      if (entry.isSymbolicLink()) {
        throw new Error(`TOC 构建 metadata 不接受符号链接：${target}`)
      }
      if (entry.isDirectory()) {
        await visit(target)
      }
      else if (entry.isFile() && entry.name.endsWith('.json')) {
        const bytes = await readFile(target, 'utf8')
        const metadata: ContentMetadata = JSON.parse(bytes)
        if (typeof metadata.source !== 'string' || typeof metadata.permalink !== 'string') {
          continue
        }
        if (!metadata.permalink.startsWith('/') || metadata.permalink.startsWith('//')
          || !metadata.frontMatter || typeof metadata.frontMatter !== 'object' || Array.isArray(metadata.frontMatter)) {
          throw new Error(`TOC 路由 metadata 缺少明确 frontmatter：${target}`)
        }
        const policy = {
          hideOnScroll: navbar.hideOnScroll,
          minHeadingLevel: metadata.frontMatter.toc_min_heading_level ?? defaults.minHeadingLevel,
          maxHeadingLevel: metadata.frontMatter.toc_max_heading_level ?? defaults.maxHeadingLevel,
        }
        if (!Number.isInteger(policy.minHeadingLevel) || !Number.isInteger(policy.maxHeadingLevel)
          || policy.minHeadingLevel < 1 || policy.maxHeadingLevel > 6 || policy.minHeadingLevel > policy.maxHeadingLevel) {
          throw new Error(`TOC 路由 metadata 的 heading 范围无效：${target}`)
        }
        const route = routeKey(metadata.permalink)
        if (policies.has(route)) {
          throw new Error(`TOC 构建 metadata 路由重复：${route}`)
        }
        files.push({ file: path.relative(websiteRoot, target), bytes })
        policies.set(route, policy)
      }
    }
  }
  for (const plugin of ['docusaurus-plugin-content-docs', 'docusaurus-plugin-content-blog', 'docusaurus-plugin-content-pages']) {
    const folder = path.join(directory, plugin)
    const entries = await readdir(folder).catch((error: NodeJS.ErrnoException) => {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error
      }
      return null
    })
    if (entries) {
      await visit(folder)
    }
  }
  files.sort((first, second) => first.file.localeCompare(second.file))
  return { policies, digest: createHash('sha256').update(JSON.stringify(files)).digest('hex') }
}

export async function loadWebsiteTocPolicies(websiteRoot: string) {
  return (await readWebsiteTocMetadata(websiteRoot)).policies
}

let policies: ReturnType<typeof loadWebsiteTocPolicies> | undefined

/** 同一个 Playwright worker 复用本次构建映射；未知路由由 DOM 就绪检查拒绝放行。 */
export async function websiteTocPolicy(pathname: string) {
  policies ??= loadWebsiteTocPolicies(fileURLToPath(new URL('../../../../', import.meta.url)))
  return (await policies).get(routeKey(pathname)) ?? null
}
