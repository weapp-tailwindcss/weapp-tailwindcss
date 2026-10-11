import type { Options as ClassicOptions } from '@docusaurus/preset-classic'
import { getSiteConfigCopy } from '../src/i18n/siteConfig'
import { getBuildLocale } from './buildLocale'
import { englishBlogSourceFiles, getBlogDirectory } from './localizedContent'

// eslint-disable-next-line perfectionist/sort-imports, ts/no-require-imports -- Docusaurus 配置需要同步 require
const npm2yarn = require('@docusaurus/remark-plugin-npm2yarn')

function createBlogOptions(): NonNullable<ClassicOptions['blog']> {
  const locale = getBuildLocale()
  const copy = getSiteConfigCopy(locale)

  return {
    path: getBlogDirectory(locale),
    // Suppress warning logs about missing truncation markers in blog previews during dev/build
    onUntruncatedBlogPosts: 'ignore',
    include: locale === 'en' ? [...englishBlogSourceFiles] : undefined,
    remarkPlugins: [
      [
        npm2yarn,
        { converters: ['pnpm'] },
      ],
    ],
    blogTitle: copy.blog.title,
    blogDescription: copy.blog.description,
    showReadingTime: true,
    postsPerPage: 10,
    feedOptions: {
      type: 'all',
      title: copy.blog.feedTitle,
      description: copy.blog.feedDescription,
      language: copy.blog.language,
    },
  }
}

export default createBlogOptions
