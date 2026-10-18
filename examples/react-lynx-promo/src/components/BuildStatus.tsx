import githubAvatar from '../assets/github-avatar.jpg'
import { creatorProfile } from '../model'

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
          className="mr-[16px] h-[128px] w-[128px] rounded-[28px]"
        />
        <view>
          <text className="text-[20px] font-bold text-white">{creatorProfile.name}</text>
          <text className="mt-2 text-[12px] font-bold text-white">{creatorProfile.project}</text>
        </view>
      </view>
      <text className="mt-3 text-[16px] text-white">{creatorProfile.detail}</text>
      <text className="mt-2 text-[14px] text-white">{creatorProfile.caption}</text>
    </view>
  )
}
