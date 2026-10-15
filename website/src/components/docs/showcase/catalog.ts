import type { ShowcaseCatalog, ShowcaseEntry, ShowcaseTranslation } from './types'
import source from './catalog.json'
import translations from './en.json'

export const showcaseCatalog: ShowcaseCatalog = source
export const showcaseEnglish: Record<string, ShowcaseTranslation> = translations

export function showcaseAnchor(id: string) {
  return `showcase-${id}`
}

export function formatShowcaseDate(value: string, locale: 'zh-cn' | 'en', withTime = false) {
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'zh-CN', {
    dateStyle: 'medium',
    ...(withTime ? { timeStyle: 'short' } as const : {}),
    timeZone: 'Asia/Shanghai',
  }).format(new Date(value))
}

/** 标识、链接和图片始终来自共享数据；翻译只能提供展示文本。 */
export function localizeShowcaseEntry(entry: ShowcaseEntry, locale: 'zh-cn' | 'en') {
  const translation = locale === 'en' ? showcaseEnglish[entry.id] : undefined
  if (locale === 'en' && !translation?.title) {
    throw new Error(`Showcase 缺少英文标题：${entry.id}`)
  }
  const title = translation?.title ?? entry.name
  return {
    ...entry,
    title,
    createdAt: formatShowcaseDate(entry.createdAt, locale),
    link: entry.link ? { ...entry.link, text: translation?.linkText ?? entry.link.text } : undefined,
    github: entry.github ? { ...entry.github, text: translation?.githubText ?? entry.github.text } : undefined,
    primaryImage: { ...entry.primaryImage, alt: locale === 'en' ? `${title} mini app code` : entry.primaryImage.alt },
    screenshots: entry.screenshots.map((image, index) => ({ ...image, alt: locale === 'en' ? `${title} screenshot ${index + 1}` : image.alt })),
  }
}
