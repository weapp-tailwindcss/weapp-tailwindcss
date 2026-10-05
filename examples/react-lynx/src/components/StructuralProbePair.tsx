import type { CompatibilityCase } from '../compatibility/types'

export function StructuralProbePair({ item }: { item: CompatibilityCase }) {
  return (
    <view className="probe-pair probe-capture-pair probe-structural-pair">
      {(['probe', 'control', 'reference'] as const).map(prefix => (
        <view key={prefix} id={`${prefix}-container-${item.id}`} flatten={false} className="probe-slot probe-capture">
          <view id={`${prefix}-${item.id}`} className="probe-structural-panel">
            {[0, 1, 2].map(index => (
              <text
                key={index}
                async-display={false}
                className={[
                  'probe-structural-text',
                  prefix === 'probe' ? item.className : '',
                  prefix === 'reference' && index === 0 ? 'probe-structural-bold' : '',
                  prefix === 'reference' && index !== 1 ? 'probe-structural-half' : '',
                ].filter(Boolean).join(' ')}
              >
                Tw4
              </text>
            ))}
          </view>
        </view>
      ))}
    </view>
  )
}
