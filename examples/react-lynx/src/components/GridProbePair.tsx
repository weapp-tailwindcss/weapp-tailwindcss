import type { CompatibilityCase } from '../compatibility/types'

export function isGridFixture(id: string) {
  return ['grid-placement', 'grid-auto', 'grid-justify-self', 'variant-supports'].includes(id)
}

export function GridProbePair({ item }: { item: CompatibilityCase }) {
  return (
    <view className="grid-probe-pair">
      {(['probe', 'control'] as const).map((prefix) => {
        const id = prefix === 'probe' ? item.id : `control-${item.id}`
        // 非法 display 值必须保持条件为假；同时捕获编码器意外展平 @supports 的情况。
        const utilities = prefix === 'probe' ? item.className : item.id === 'variant-supports' ? 'supports-[display:weapp-invalid]:grid' : ''
        return (
          <view key={prefix} id={`${prefix}-container-${item.id}`} flatten={false} className={`grid-probe-slot grid-slot-${item.id}`}>
            {item.id === 'grid-placement' && <view className="grid-placement-blocker" />}
            <view id={`${prefix}-${item.id}`} className={`grid-probe grid-probe-${item.id} ${utilities}`}>
              {item.id === 'grid-auto' && <view id={`probe-child-${id}-b`} className="grid-auto-first" />}
              {item.id === 'variant-supports' && <view className="grid-supports-first" />}
              <view id={`probe-child-${id}-a`} className={`grid-measured-child grid-child-${item.id}`} />
              {item.id === 'grid-justify-self' && <view id={`probe-child-${id}-b`} className="grid-justify-second" />}
            </view>
          </view>
        )
      })}
    </view>
  )
}
