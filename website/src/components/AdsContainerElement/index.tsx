import type { DisplayCampaign } from './campaigns'
import { useCurrentSiteLocale } from '@site/src/i18n/runtime'
import React, { useEffect, useState } from 'react'
import {
  fallbackCampaign,
  paidCampaigns,
  selectDisplayCampaign,
} from './campaigns'

const CAMPAIGN_REFRESH_INTERVAL = 60_000

function AdsContainerElement() {
  const locale = useCurrentSiteLocale()
  const [campaign, setCampaign] = useState<DisplayCampaign>(fallbackCampaign)

  useEffect(() => {
    const refreshCampaign = () => {
      setCampaign(selectDisplayCampaign(
        paidCampaigns,
        'weapp-tailwindcss',
        fallbackCampaign,
      ))
    }

    refreshCampaign()
    const timer = window.setInterval(refreshCampaign, CAMPAIGN_REFRESH_INTERVAL)
    return () => window.clearInterval(timer)
  }, [])

  const creative = campaign.creative[locale]

  return (
    <div className="px-4" data-sponsor-campaign={campaign.id}>
      <a
        className={`
          flex h-[176px] w-full flex-col items-center justify-center gap-3
          overflow-hidden rounded-lg border border-slate-200 bg-white px-4 py-5
          text-center text-slate-900 shadow-sm transition-colors
          hover:border-sky-400 hover:no-underline
          dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100
          dark:hover:border-sky-500
        `}
        href={campaign.href}
        target="_blank"
        rel="noopener sponsored nofollow"
        aria-label={`${creative.brand}: ${creative.copy}`}
      >
        <span className="text-[10px] font-semibold uppercase text-slate-500 dark:text-slate-400">
          {locale === 'en' ? 'Sponsored' : '赞助商'}
        </span>
        <span className="flex h-12 w-full items-center justify-center">
          <img
            className={creative.logoDarkSrc ? 'h-10 max-w-full object-contain dark:hidden' : 'h-10 max-w-full object-contain'}
            src={creative.logoSrc}
            alt={creative.logoAlt}
            width="160"
            height="40"
          />
          {creative.logoDarkSrc
            ? (
                <img
                  className="hidden h-10 max-w-full object-contain dark:block"
                  src={creative.logoDarkSrc}
                  alt={creative.logoAlt}
                  width="160"
                  height="40"
                />
              )
            : null}
        </span>
        <strong className="text-sm font-semibold">{creative.brand}</strong>
        <span className="line-clamp-2 min-h-10 text-xs leading-5 text-slate-600 dark:text-slate-300">
          {creative.copy}
        </span>
      </a>
      <a
        className="mt-3 block text-center text-xs font-medium text-sky-700 hover:no-underline dark:text-sky-300"
        href={locale === 'en'
          ? 'https://github.com/sonofmagic/sponsors/issues/new?template=business-sponsorship-en.yml'
          : 'https://github.com/sonofmagic/sponsors/issues/new?template=business-sponsorship-zh.yml'}
        target="_blank"
        rel="noopener"
      >
        {locale === 'en' ? 'Advertise here' : '申请广告位'}
      </a>
    </div>
  )
}

export default AdsContainerElement
