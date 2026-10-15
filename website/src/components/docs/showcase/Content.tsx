import type { ReactNode } from 'react'
import { useCurrentSiteLocale } from '@site/src/i18n/runtime'
import BaseCard from '../ShowcaseCard'
import BaseIndex from '../ShowcaseIndex'
import { formatShowcaseDate, localizeShowcaseEntry, showcaseAnchor, showcaseCatalog } from './catalog'

export function ShowcaseIndex() {
  const locale = useCurrentSiteLocale()
  const items = showcaseCatalog.entries.map(entry => ({
    title: localizeShowcaseEntry(entry, locale).title,
    href: `#${showcaseAnchor(entry.id)}`,
    createdAt: formatShowcaseDate(entry.createdAt, locale),
    authorLogin: entry.authorLogin,
    screenshotCount: entry.screenshots.length,
    hasLink: Boolean(entry.link?.url),
    hasGithub: Boolean(entry.github),
  }))
  return <BaseIndex issueUrl={showcaseCatalog.issueUrl} generatedAt={formatShowcaseDate(showcaseCatalog.generatedAt, locale, true)} items={items} />
}

export function ShowcaseCard({ entryId, children }: { entryId: string, children?: ReactNode }) {
  const locale = useCurrentSiteLocale()
  const entry = showcaseCatalog.entries.find(entry => entry.id === entryId)
  if (!entry) {
    throw new Error(`Showcase 引用了未知案例：${entryId}`)
  }
  return <BaseCard {...localizeShowcaseEntry(entry, locale)} anchorId={showcaseAnchor(entry.id)}>{children}</BaseCard>
}
