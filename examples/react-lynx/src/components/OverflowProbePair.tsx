import { overflowContract as contract } from '../compatibility/overflow-contract'

export function OverflowProbePair() {
  return (
    <view className="probe-overflow-pair">
      {(['probe', 'control'] as const).map(prefix => (
        <view key={prefix} id={`${prefix}-container-${contract.id}`} flatten={false} async-display={false} className="probe-overflow-canvas">
          <view id={`${prefix}-${contract.id}`} flatten={false} async-display={false} className={`probe-overflow-panel ${prefix === 'probe' ? contract.candidate : 'probe-overflow-control'}`}>
            <view id={`probe-child-${prefix === 'control' ? 'control-' : ''}${contract.id}-a`} flatten={false} async-display={false} className="probe-overflow-child" />
          </view>
        </view>
      ))}
    </view>
  )
}
