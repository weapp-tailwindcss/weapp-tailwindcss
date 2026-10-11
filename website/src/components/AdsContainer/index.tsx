import AdsContainerElement from '@site/src/components/AdsContainerElement'
import React from 'react'

function AdsContainer() {
  return (
    <div className={`
      hidden min-h-[224px]
      border-t
      border-[color:var(--ifm-toc-border-color)]
      pt-4
      lg:block
    `}
    >
      <AdsContainerElement />
    </div>

  )
}

export default AdsContainer
