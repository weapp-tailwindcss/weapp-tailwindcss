import type { ComponentProps } from 'react'
import Head from '@docusaurus/Head'
import { useLocation } from '@docusaurus/router'
import { getSiteLanguage } from '@site/config/siteMetadata'
import { UiManagementProvider } from '@site/src/features/ui-management/context'
import { localePreferenceStorageKey, stripLocalePrefix } from '@site/src/i18n/locale'
import { useCurrentSiteLocale } from '@site/src/i18n/runtime'
import Layout from '@theme-original/Layout'
import React, { useEffect } from 'react'

type LayoutWrapperProps = ComponentProps<typeof Layout>

export default function LayoutWrapper(props: LayoutWrapperProps) {
  const location = useLocation()
  const locale = useCurrentSiteLocale()
  const isHomepage = stripLocalePrefix(location.pathname) === '/'

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }
    try {
      window.localStorage.setItem(localePreferenceStorageKey, locale)
    }
    catch {
      // ignore persistence failures
    }
  }, [locale])

  return (
    <UiManagementProvider>
      <div className="relative">
        {/* {location.pathname !== '/' && (
          <div className="pointer-events-none absolute inset-0 z-[201]">
            <div className="light-effect pointer-events-none absolute right-[13.14%]"></div>
          </div>
        )} */}
        <Layout {...props} />
        <Head>
          <meta httpEquiv="Content-Language" content={getSiteLanguage(locale)} />
        </Head>
        {isHomepage && (
          <div className="
            pointer-events-none absolute inset-0 z-[202] flex-none
          "
          >
            <div className={`
              size-full rounded-none bg-[url(/img/framer.png)] bg-[length:128px]
              bg-repeat opacity-5
            `}
            >
            </div>
          </div>
        )}
      </div>
    </UiManagementProvider>
  )
}
