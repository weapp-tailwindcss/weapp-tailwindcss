import type { ThemeConfig } from '@docusaurus/preset-classic'
import { getSiteConfigCopy } from '../src/i18n/siteConfig'
import { getBuildLocale } from './buildLocale'

const locale = getBuildLocale()
const copy = getSiteConfigCopy(locale)

const englishItems: NonNullable<ThemeConfig['navbar']>['items'] = [
  {
    type: 'doc',
    docId: 'intro',
    position: 'left',
    label: copy.navbar.guide,
  },
  {
    type: 'doc',
    docId: 'showcase/index',
    position: 'left',
    label: copy.navbar.showcase,
  },
  {
    type: 'doc',
    docId: 'api/interfaces/UserDefinedOptions',
    position: 'left',
    label: copy.navbar.options,
  },
  {
    to: '/blog',
    position: 'left',
    label: copy.navbar.blog,
  },
]

const chineseItems: NonNullable<ThemeConfig['navbar']>['items'] = [
  {
    type: 'doc',
    docId: 'intro',
    position: 'left',
    label: copy.navbar.guide,
  },
  {
    type: 'doc',
    label: copy.navbar.ecosystem,
    docId: 'community/templates',
  },
  {
    type: 'doc',
    label: copy.navbar.issues,
    docId: 'issues/index',
  },
  {
    type: 'doc',
    label: copy.navbar.showcase,
    docId: 'showcase/index',
  },
  {
    type: 'doc',
    label: copy.navbar.migrations,
    docId: 'migrations/v5',
  },
  {
    type: 'doc',
    docId: 'api/interfaces/UserDefinedOptions',
    position: 'left',
    label: copy.navbar.options,
  },
  {
    to: '/blog',
    position: 'left',
    label: copy.navbar.blog,
  },
  {
    type: 'doc',
    label: copy.navbar.tailwindTopic,
    docId: 'tailwindcss/index',
    position: 'left',
  },
]

const commonItems: NonNullable<ThemeConfig['navbar']>['items'] = [
  {
    href: 'https://vite.icebreaker.top/',
    position: 'left',
    label: 'Weapp-vite',
    className: 'navbar__weapp-vite-link',
  },
  {
    type: 'dropdown',
    label: 'v5',
    position: 'right',
    items: [
      {
        label: copy.navbar.currentV5,
        href: '/',
      },
      {
        label: copy.navbar.latestV4,
        href: 'https://v4.tw.icebreaker.top/',
      },
    ],
  },
  {
    type: 'localeDropdown',
    position: 'right',
  },
  {
    href: 'https://atomgit.com/sonofmagic/weapp-tailwindcss',
    label: 'AtomGit',
    className: 'navbar__atomgit-link',
    position: 'right',
  },
  {
    href: 'https://github.com/weapp-tailwindcss/weapp-tailwindcss',
    label: 'GitHub',
    className: 'navbar__github-link',
    position: 'right',
  },
]

const navbar: NonNullable<ThemeConfig['navbar']> = {
  title: 'weapp-tailwindcss',
  logo: {
    alt: 'weapp tailwindcss Logo',
    src: 'img/logo.png',
  },
  items: [...(locale === 'en' ? englishItems : chineseItems), ...commonItems],
}

export default navbar
