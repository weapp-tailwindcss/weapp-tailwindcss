import type { CompatibilityCase } from '../compatibility/types'

export function isGridFixture(id: string) {
  return ['grid-placement', 'grid-auto', 'grid-justify-self'].includes(id)
}

export function GridProbePair({ item }: { item: CompatibilityCase }) {
  return (
    <view className="grid-probe-pair">
      {(['probe', 'control'] as const).map((prefix) => {
        const id = prefix === 'probe' ? item.id : `control-${item.id}`
        return (
          <view key={prefix} id={`${prefix}-container-${item.id}`} flatten={false} className={`grid-probe-slot grid-slot-${item.id}`}>
            {item.id === 'grid-placement' && <view className="grid-placement-blocker" />}
            <view id={`${prefix}-${item.id}`} className={`grid-probe grid-probe-${item.id} ${prefix === 'probe' ? item.className : ''}`}>
              {item.id === 'grid-auto' && <view id={`probe-child-${id}-b`} className="grid-auto-first" />}
              <view id={`probe-child-${id}-a`} className={`grid-measured-child grid-child-${item.id}`} />
              {item.id === 'grid-justify-self' && <view id={`probe-child-${id}-b`} className="grid-justify-second" />}
            </view>
          </view>
        )
      })}
    </view>
  )
}
