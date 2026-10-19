import { MEDIA_GATE_PROBE_IDS } from '../compatibility/media-gate-contract'

/** 独立无伪状态的媒体对照帧始终挂载，供原生宿主读取真实布局与像素。 */
export function MediaGateProbes() {
  return (
    <view className="media-hover-v1-fixtures" flatten={false}>
      {MEDIA_GATE_PROBE_IDS.map(id => (
        <view key={id} id={`container-media-hover-v1-${id}`} className="media-hover-v1-container" flatten={false}>
          <view id={`media-hover-v1-${id}`} className={`media-hover-v1-target media-hover-v1-${id}`} flatten={false} />
        </view>
      ))}
    </view>
  )
}
