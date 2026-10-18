import { buildStatus } from '../model'

export function BuildStatus() {
  return (
    <view className="mt-4 border border-[#2c383c] rounded-[18px] p-4 bg-[#10241b]">
      <view className="flex flex-row items-center justify-between">
        <text className="text-[12px] font-bold text-[#75dfa6]">{buildStatus.label}</text>
        <text className="text-[12px] font-bold text-[#edf4f1]">{buildStatus.target}</text>
      </view>
      <text className="mt-3 text-[11px] text-[#aebdc2]">{buildStatus.detail}</text>
      <text className="mt-2 text-[10px] text-[#87979c]">Tailwind utilities to native styles</text>
      <view className="mt-4 h-[4px] rounded-[4px] bg-[#07c160]" />
    </view>
  )
}
