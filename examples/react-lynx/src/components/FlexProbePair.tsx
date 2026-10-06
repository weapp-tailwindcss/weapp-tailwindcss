import type { CompatibilityCase } from '../compatibility/types'

export function isFlexFixture(id: string) {
  return ['flex-grow', 'flex-wrap-order', 'flex-shorthand-shrink'].includes(id)
}

export function FlexProbePair({ item }: { item: CompatibilityCase }) {
  const shrink = item.id === 'flex-shorthand-shrink'
  const wrap = item.id === 'flex-wrap-order'
  return (
    <view className="flex-probe-pair">
      {(['probe', 'control'] as const).map((prefix) => {
        const id = prefix === 'probe' ? item.id : `control-${item.id}`
        const candidates = prefix === 'probe' ? item.className.split(/\s+/) : []
        // shorthand 在外层扩张；shrink 在内层拥挤行独立取证，避免零 basis 隐藏收缩效果。
        const parentClasses = candidates.filter(candidate => !shrink || candidate !== 'shrink-0').join(' ')
        const childClasses = shrink ? candidates.filter(candidate => candidate === 'shrink-0').join(' ') : ''
        return (
          <view key={prefix} id={`${prefix}-container-${item.id}`} flatten={false} className={`flex-probe-slot flex-slot-${item.id}`}>
            <view id={`${prefix}-${item.id}`} className={`flex-probe flex-probe-${item.id} ${parentClasses}`}>
              {wrap && <view className="flex-wrap-first" />}
              <view id={`probe-child-${id}-a`} className={`flex-measured-child flex-child-${item.id} ${childClasses}`} />
              {shrink && <view className="flex-shrink-competitor" />}
            </view>
            <view className={`flex-competitor flex-competitor-${item.id}`} />
          </view>
        )
      })}
    </view>
  )
}
