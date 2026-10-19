import { importantPriorityContract as contract } from '../compatibility/important-priority-contract'

export function ImportantProbePair() {
  return (
    <view className="probe-pair probe-capture-pair">
      {contract.frames.map(prefix => (
        <view key={prefix} id={`${prefix}-container-${contract.id}`} flatten={false} className="probe-slot probe-capture">
          <view
            id={`${prefix}-${contract.id}`}
            flatten={false}
            async-display={false}
            className={`probe-important-body ${prefix === 'probe' ? contract.candidate : prefix === 'control' ? contract.normalCandidate : 'probe-important-reference'}`}
          />
        </view>
      ))}
    </view>
  )
}
