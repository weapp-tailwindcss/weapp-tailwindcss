import Head from '@docusaurus/Head'
import { useBlogPostStructuredData } from '@docusaurus/plugin-content-blog/client'
import { organizationId, softwareId, websiteId } from '@site/config/siteMetadata'
import React from 'react'

export default function BlogPostStructuredData() {
  const structuredData = useBlogPostStructuredData()
  const url = typeof structuredData.url === 'string' ? structuredData.url : ''
  return (
    <Head>
      <script id="blog-post-jsonld" type="application/ld+json">
        {JSON.stringify({
          ...structuredData,
          '@id': `${url}#article`,
          'mainEntityOfPage': { '@id': `${url}#webpage` },
          'publisher': { '@id': organizationId },
          'about': { '@id': softwareId },
          'isPartOf': { '@id': websiteId },
        })}
      </script>
    </Head>
  )
}
