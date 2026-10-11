import type { CompatibilityCase } from '../compatibility/types'

export function FlowProbePair({ item }: { item: CompatibilityCase }) {
  const utilities = item.className.split(/\s+/)
  return (
    <view className="probe-pair probe-capture-pair">
      {(['probe', 'control', 'reference'] as const).map(prefix => (
        <view key={prefix} id={`${prefix}-container-${item.id}`} flatten={false} className="probe-slot probe-capture">
          <view id={`${prefix}-${item.id}`} className="probe-flow-panel">
            <text async-display={false} className="probe-flow-line">
              X
              <view className={[
                'probe-flow-marker',
                prefix === 'probe' ? utilities.find(value => value.startsWith('align-')) : '',
                prefix === 'reference' ? 'probe-flow-middle' : '',
              ].filter(Boolean).join(' ')}
              />
            </text>
            {prefix === 'reference'
              ? (
                  <view className="probe-flow-reference">
                    {['X\u00A0\u00A0X', 'X X X X', 'X X'].map((line, index) => (
                      <text key={index} async-display={false} className="probe-flow-row">{line}</text>
                    ))}
                  </view>
                )
              : (
                  <text
                    async-display={false}
                    className={[
                      'probe-flow-text',
                      prefix === 'probe' ? utilities.find(value => value.startsWith('whitespace-')) : '',
                    ].filter(Boolean).join(' ')}
                  >
                    {'X  X\nX X X X X X'}
                  </text>
                )}
          </view>
        </view>
      ))}
    </view>
  )
}
