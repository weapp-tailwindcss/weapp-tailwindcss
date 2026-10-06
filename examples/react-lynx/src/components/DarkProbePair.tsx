import type { CompatibilityCase } from '../compatibility/types'

export function DarkProbePair({ item }: { item: CompatibilityCase }) {
  return (
    <view className="probe-pair probe-capture-pair probe-dark-pair">
      {(['probe', 'control'] as const).map(prefix => (
        <view key={prefix} id={`${prefix}-container-${item.id}`} flatten={false} className="probe-slot probe-capture">
          <view id={`${prefix}-${item.id}`} className="probe-dark-panel">
            <text async-display={false} className={`probe-dark-text ${prefix === 'probe' ? item.className : ''}`}>Tw4</text>
          </view>
        </view>
      ))}
    </view>
  )
}
