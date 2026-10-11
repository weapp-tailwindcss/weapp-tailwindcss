import type { Props } from '@theme/DocBreadcrumbs/StructuredData'
import Head from '@docusaurus/Head'
import { useBreadcrumbsStructuredData } from '@docusaurus/plugin-content-docs/client'
import { useLocation } from '@docusaurus/router'
import { siteUrl } from '@site/config/siteMetadata'
import { toAbsoluteLocaleUrl } from '@site/src/i18n/locale'
import { useCurrentSiteLocale } from '@site/src/i18n/runtime'
import React from 'react'

export default function DocBreadcrumbsStructuredData(props: Props) {
  const locale = useCurrentSiteLocale()
  const { pathname } = useLocation()
  const canonicalUrl = toAbsoluteLocaleUrl(siteUrl, pathname, locale)
  const structuredData = useBreadcrumbsStructuredData({ breadcrumbs: props.breadcrumbs })
  return (
    <Head>
      <script id="doc-breadcrumb-jsonld" type="application/ld+json">
        {JSON.stringify({ ...structuredData, '@id': `${canonicalUrl}#breadcrumb` })}
      </script>
    </Head>
  )
}
