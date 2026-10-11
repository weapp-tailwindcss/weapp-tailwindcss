interface SummaryProps {
  total: number
  supported: number
  unsupported: number
  platform: number
  pending: number
  verifiedAt: string | null
}

export function Summary({ total, supported, unsupported, platform, pending, verifiedAt }: SummaryProps) {
  return (
    <view className="summary-panel">
      <view className="flex flex-row justify-between">
        <view>
          <text className="text-[12px] text-[#607178]">功能族覆盖</text>
          <text className="mt-1 text-[22px] font-bold text-[#0b1519]">
            {total}
            {' '}
            cases
          </text>
        </view>
        <view className="items-end">
          <text className="text-[12px] text-[#607178]">双端结果</text>
          <text className="mt-1 text-[14px] font-bold text-[#16734b]">
            {supported}
            {' '}
            支持 ·
            {' '}
            {platform}
            {' '}
            差异
          </text>
          <text className="mt-1 text-[11px] text-[#607178]">
            {unsupported}
            {' '}
            不支持 ·
            {' '}
            {pending}
            {' '}
            待验收
          </text>
        </view>
      </view>
      <view className={verifiedAt ? 'verification-banner verification-ready' : 'verification-banner verification-pending'}>
        <text className="text-[12px] font-bold text-[#26353b]">
          {verifiedAt ? `双端 e2e：${verifiedAt}` : '尚未生成 iOS + Android 双端 e2e 基线'}
        </text>
      </view>
    </view>
  )
}
