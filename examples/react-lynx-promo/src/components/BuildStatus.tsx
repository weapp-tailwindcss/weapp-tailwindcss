import githubAvatar from '../assets/github-avatar.jpg'
import { buildStatus } from '../model'

export function BuildStatus() {
  return (
    <view
      className="
        mt-4
        p-[24px] rounded-[28px]
        bg-[#047857]
      "
    >
      <view className="flex flex-row items-center">
        <image
          src={githubAvatar}
          mode="aspectFill"
          className="mr-[16px] h-[96px] w-[96px] rounded-[28px]"
        />
        <view>
          <text className="text-[20px] font-bold text-white">{buildStatus.label}</text>
          <text className="mt-2 text-[12px] font-bold text-white">{buildStatus.target}</text>
        </view>
      </view>
      <text className="mt-3 text-[16px] text-white">{buildStatus.detail}</text>
      <text className="mt-2 text-[14px] text-white">Tailwind utilities to native styles</text>
    </view>
  )
}
