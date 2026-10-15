import type { ShowcaseCatalog, ShowcaseTranslation } from '../../website/src/components/docs/showcase/types'

export interface ShowcaseSourceEntry {
  id: number
  name: string
  createdAt: string
  commentUrl: string
  author: { login: string, html_url: string }
  link?: { text: string, url?: string }
  github?: { text: string, url?: string }
  description?: string
  images: { src: string, alt: string }[]
}

function parseShowcaseCards(markdown: string) {
  return [...markdown.matchAll(/<ShowcaseCard\s+entryId="(\d+)"\s*(?:\/>|>([\s\S]*?)<\/ShowcaseCard>)/g)].map(match => ({
    id: match[1],
    body: (match[2] ?? '').replace(/<!--[\s\S]*?-->|\{\/\*[\s\S]*?\*\/\}/g, '').trim(),
  }))
}

export function getShowcaseDescriptionIds(markdown: string) {
  return parseShowcaseCards(markdown).filter(card => card.body).map(card => card.id)
}

/** 发布前验证翻译的身份集合与正文，必须在清理图片或写入任何产物之前调用。 */
export function validateShowcaseLocalization(ids: string[], translations: Record<string, ShowcaseTranslation>, markdown: string, requiredDescriptionIds: readonly string[]) {
  const expected = [...ids].sort()
  const cards = parseShowcaseCards(markdown)
  const referenced = cards.map(card => card.id).sort()
  if (new Set(ids).size !== ids.length || JSON.stringify(referenced) !== JSON.stringify(expected)) {
    throw new Error('Showcase 英文描述与共享案例身份不一致，请先补齐或移除对应 entryId；尚未清理图片或写入产物。')
  }
  const translated = Object.keys(translations).sort()
  if (JSON.stringify(translated) !== JSON.stringify(expected) || ids.some(id => !translations[id]?.title?.trim())) {
    throw new Error('Showcase 英文标题与共享案例身份不一致，请先补齐翻译；尚未清理图片或写入产物。')
  }
  const emptyDescriptions = requiredDescriptionIds.filter(id => !cards.find(card => card.id === id)?.body)
  if (emptyDescriptions.length) {
    throw new Error(`Showcase 英文描述为空：${emptyDescriptions.join(', ')}；请补齐源案例已有正文的翻译，尚未清理图片或写入产物。`)
  }
}

export function renderShowcaseCatalog(issueUrl: string, entries: ShowcaseSourceEntry[], generatedAt: string): ShowcaseCatalog {
  return {
    issueUrl,
    generatedAt,
    entries: entries.map((entry) => {
      const [primaryImage, ...screenshots] = entry.images.map(image => ({ src: image.src, alt: image.alt }))
      if (!primaryImage) {
        throw new Error(`Showcase 案例缺少图片：${entry.id}`)
      }
      return {
        id: String(entry.id),
        name: entry.name,
        createdAt: entry.createdAt,
        commentUrl: entry.commentUrl,
        authorLogin: entry.author.login,
        authorUrl: entry.author.html_url,
        ...(entry.link?.url ? { titleHref: entry.link.url } : {}),
        ...(entry.link ? { link: entry.link } : {}),
        ...(entry.github ? { github: entry.github } : {}),
        primaryImage,
        screenshots,
      }
    }),
  }
}

/** MDX 只保存可翻译正文；结构化字段不能再进入机器翻译链路。 */
export function renderShowcaseMarkdown(issue: { title: string, html_url: string }, entries: ShowcaseSourceEntry[]) {
  const lines = [
    '---',
    'title: 优秀案例展示',
    `description: 以下内容来自 ${issue.title}，列表顺序按照提交时间排序。`,
    'keywords:',
    ...['优秀案例展示', 'showcase', 'weapp-tailwindcss', 'tailwindcss', '小程序', '微信小程序', 'uni-app', 'taro', 'mpx'].map(keyword => `  - ${keyword}`),
    '---',
    '<!-- 该文件由 scripts/update-showcase.ts 自动生成，维护命令：pnpm showcase:update。 -->',
    '',
    `import { ShowcaseCard, ShowcaseIndex } from '@site/src/components/docs/showcase/Content'`,
    '',
    '# 优秀案例展示',
    '',
    `以下内容来自 [${issue.title}](${issue.html_url})，列表顺序按照提交时间排序。`,
    '',
    '<ShowcaseIndex />',
    '',
    '<div className="showcase-grid">',
  ]
  for (const entry of entries) {
    if (entry.description) {
      lines.push(`<ShowcaseCard entryId="${entry.id}">`, '', entry.description, '', '</ShowcaseCard>')
    }
    else {
      lines.push(`<ShowcaseCard entryId="${entry.id}" />`)
    }
  }
  return [...lines, '</div>', ''].join('\n')
}
