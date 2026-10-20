import type { CompatibilityCase } from '../compatibility/types'

export function ResponsiveProbePair({ item }: { item: CompatibilityCase }) {
  return (
    <view className="probe-responsive-pair">
      <view id="responsive-threshold" flatten={false} className="probe-responsive-threshold" />
      {(['probe', 'control'] as const).map(prefix => (
        <view key={prefix} id={`${prefix}-container-${item.id}`} flatten={false} className="probe-responsive-canvas">
          <view id={`${prefix}-${item.id}`} flatten={false} className={`probe-responsive-panel ${prefix === 'probe' ? item.className : ''}`} />
        </view>
      ))}
    </view>
  )
}
