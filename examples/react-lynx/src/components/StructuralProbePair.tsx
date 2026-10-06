import type { CompatibilityCase } from '../compatibility/types'

function StaticStructuralProbePanel({ id }: { id: string }) {
  return (
    <view id={id} flatten={false} className="probe-structural-panel">
      <view flatten={false} async-display={false} className="probe-structural-line first:font-bold odd:opacity-50">
        <text className="probe-structural-text" async-display={false}>
          Tw4
        </text>
      </view>
      <view flatten={false} async-display={false} className="probe-structural-line first:font-bold odd:opacity-50">
        <text className="probe-structural-text" async-display={false}>
          Tw4
        </text>
      </view>
      <view flatten={false} async-display={false} className="probe-structural-line first:font-bold odd:opacity-50">
        <text className="probe-structural-text" async-display={false}>
          Tw4
        </text>
      </view>
    </view>
  )
}

export function StructuralProbePair({ item }: { item: CompatibilityCase }) {
  return (
    <view className="probe-pair probe-capture-pair probe-structural-pair">
      {(['probe', 'control', 'reference'] as const).map(prefix => (
        <view key={prefix} id={`${prefix}-container-${item.id}`} flatten={false} className="probe-slot probe-capture">
          {prefix === 'probe'
            ? <StaticStructuralProbePanel id={`${prefix}-${item.id}`} />
            : (
                <view id={`${prefix}-${item.id}`} flatten={false} className="probe-structural-panel">
                  {[0, 1, 2].map((index) => {
                    const stateClasses = [
                      prefix === 'reference' && index === 0 ? 'probe-structural-bold' : '',
                      prefix === 'reference' && index !== 1 ? 'probe-structural-half' : '',
                    ].filter(Boolean).join(' ')
                    const textStateClasses = [
                      prefix === 'reference' && index === 0 ? 'probe-structural-bold' : '',
                    ].filter(Boolean).join(' ')
                    return (
                      <view key={index} flatten={false} async-display={false} className={['probe-structural-line', stateClasses].filter(Boolean).join(' ')}>
                        <text className={['probe-structural-text', textStateClasses].filter(Boolean).join(' ')} async-display={false}>
                          Tw4
                        </text>
                      </view>
                    )
                  })}
                </view>
              )}
        </view>
      ))}
    </view>
  )
}
