import type { ThemeConfig } from '@docusaurus/preset-classic'
import { getSiteConfigCopy } from '../src/i18n/siteConfig'
import { getBuildLocale } from './buildLocale'

const locale = getBuildLocale()
const copy = getSiteConfigCopy(locale)

const footerLinks: NonNullable<ThemeConfig['footer']>['links'] = [
  {
    title: copy.footer.docs,
    items: locale === 'en'
      ? [
          {
            label: copy.footer.guide,
            to: '/docs/intro',
          },
          {
            label: copy.footer.blog,
            to: '/blog',
          },
        ]
      : [
          {
            label: copy.footer.guide,
            to: '/docs/intro',
          },
          {
            label: copy.footer.options,
            to: '/docs/api/interfaces/UserDefinedOptions',
          },
          {
            label: copy.footer.issues,
            to: '/docs/issues/',
          },
          {
            label: copy.footer.blog,
            to: '/blog',
          },
        ],
  },
  {
    title: copy.footer.more,
    items: [
      {
        label: 'GitHub',
        href: 'https://github.com/weapp-tailwindcss/weapp-tailwindcss',
      },
      {
        label: 'Code of Conduct',
        href: 'https://github.com/weapp-tailwindcss/weapp-tailwindcss/blob/main/CODE_OF_CONDUCT.md',
      },
      {
        label: 'weapp-vite',
        href: 'https://vite.icebreaker.top',
      },
    ],
  },
]

const copyrightYears = '2021-present'

export const footerCustomFields = {
  legal: {
    href: '/copyright',
    label: copy.footer.copyrightLabel,
    target: '_self',
  },
  owner: {
    href: 'https://github.com/sonofmagic',
    name: 'sonofmagic',
  },
} as const

export const footer: NonNullable<ThemeConfig['footer']> = {
  style: 'dark',
  links: footerLinks,
  copyright: `<a href="/copyright" target="_self" rel="noopener noreferrer">${copy.footer.copyrightLabel}</a> © ${copyrightYears} <a href="https://github.com/sonofmagic" target="_blank" rel="noopener noreferrer">sonofmagic</a>. Released under the <a href="https://github.com/weapp-tailwindcss/weapp-tailwindcss/blob/main/LICENSE" target="_blank" rel="noopener noreferrer">MIT License</a>.`,
}
