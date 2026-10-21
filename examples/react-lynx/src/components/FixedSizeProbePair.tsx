import type { CompatibilityCase } from '../compatibility/types'

// 独立于 compat-probe 的 min-height、padding 和文字布局，保留原候选原样消费。
export function FixedSizeProbePair({ item }: { item: CompatibilityCase }) {
  return (
    <view className="fixed-size-pair">
      <view id="probe-container-sizing-fixed" flatten={false} className="fixed-size-slot">
        <view id="probe-sizing-fixed" flatten={false} className={`fixed-size-probe ${item.className}`}>
          <view id="probe-child-sizing-fixed-a" flatten={false} className="fixed-size-marker" />
        </view>
      </view>
      <view id="control-container-sizing-fixed" flatten={false} className="fixed-size-slot">
        <view id="control-sizing-fixed" flatten={false} className="fixed-size-probe">
          <view id="probe-child-control-sizing-fixed-a" flatten={false} className="fixed-size-marker" />
        </view>
      </view>
    </view>
  )
}
