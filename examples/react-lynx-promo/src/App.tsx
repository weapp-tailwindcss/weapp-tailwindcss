import { BuildStatus } from './components/BuildStatus'
import { pipelineSteps } from './model'

function Metric({ label, value, detail }: { label: string, value: string, detail: string }) {
  return (
    <view className="w-[48%] rounded-[16px] border border-[#263236] bg-[#151b1d] p-4">
      <text className="text-[11px] font-bold text-[#829196]">{label}</text>
      <text className="mt-3 text-[25px] font-bold text-[#edf4f1]">{value}</text>
      <text className="mt-1 text-[10px] text-[#6f8086]">{detail}</text>
    </view>
  )
}

export function App() {
  return (
    <scroll-view scroll-y className="h-screen bg-[#0d1112] text-[#edf4f1]">
      <view className="pb-8 pl-5 pr-5 pt-[72px]">
        <view className="flex flex-row items-center justify-between">
          <view>
            <text className="text-[11px] font-bold text-[#75dfa6]">WEAPP TAILWINDCSS</text>
            <text className="mt-2 text-[26px] font-bold text-[#f1f6f4]">Lynx Build Console</text>
          </view>
          <view className="rounded-[12px] border border-[#2d3a3e] bg-[#182023] pb-2 pl-3 pr-3 pt-2">
            <text className="text-[11px] font-bold text-[#b8c6ca]">DEMO</text>
          </view>
        </view>

        <BuildStatus />

        <view className="mt-4 flex flex-row justify-between">
          <Metric label="STYLE ENGINE" value="Tailwind 4" detail="theme + utilities" />
          <Metric label="BUNDLER" value="Rspeedy" detail="Lynx encoder" />
        </view>

        <view className="mt-4 rounded-[18px] border border-[#263236] bg-[#151b1d] p-4">
          <view className="flex flex-row items-center justify-between">
            <text className="text-[13px] font-bold text-[#e8efed]">Native targets</text>
            <text className="text-[10px] text-[#718187]">same component code</text>
          </view>
          <view className="mt-4 flex flex-row justify-between">
            <view className="w-[48%] rounded-[12px] bg-[#1c2528] p-3">
              <text className="text-[11px] font-bold text-[#75dfa6]">iOS</text>
              <text className="mt-2 text-[10px] text-[#9baaae]">ReactLynx views</text>
            </view>
            <view className="w-[48%] rounded-[12px] bg-[#1c2528] p-3">
              <text className="text-[11px] font-bold text-[#75dfa6]">Android</text>
              <text className="mt-2 text-[10px] text-[#9baaae]">ReactLynx views</text>
            </view>
          </view>
        </view>

        <text className="mb-3 mt-6 text-[12px] font-bold text-[#829196]">IN THIS DEMO</text>
        {pipelineSteps.map((item, index) => (
          <view key={item.id} className={index === 0 ? 'rounded-[14px] bg-[#17201d] p-4' : 'mt-2 rounded-[14px] bg-[#151b1d] p-4'}>
            <view className="flex flex-row items-center justify-between">
              <text className="text-[12px] font-bold text-[#dde7e4]">{item.label}</text>
              <text className="text-[10px] font-bold text-[#75dfa6]">{item.stage}</text>
            </view>
            <text className="mt-2 text-[10px] text-[#718187]">
              {item.detail}
            </text>
          </view>
        ))}

        <view className="mt-6 min-h-[260px] rounded-[18px] border border-[#263236] bg-[#151b1d] p-4">
          <text className="text-[13px] font-bold text-[#e8efed]">Build &amp; reload</text>
          <text className="mt-2 text-[11px] text-[#9baaae]">From a className edit to native styles.</text>
          <view className="mt-4 rounded-[12px] bg-[#1c2528] p-3">
            <text className="text-[10px] font-bold text-[#75dfa6]">01 / EDIT THE COMPONENT</text>
            <text className="mt-2 text-[11px] text-[#dde7e4]">src/components/BuildStatus.tsx</text>
          </view>
          <view className="mt-3 rounded-[12px] bg-[#1c2528] p-3">
            <text className="text-[10px] font-bold text-[#75dfa6]">02 / BUILD WITH RSPEEDY</text>
            <text className="mt-2 text-[12px] font-bold text-[#dde7e4]">pnpm build</text>
            <text className="mt-2 text-[10px] text-[#9baaae]">pluginLynxTailwindcss() generates the styles.</text>
          </view>
          <view className="mt-3 rounded-[12px] bg-[#1c2528] p-3">
            <text className="text-[10px] font-bold text-[#75dfa6]">03 / CHECK THE NATIVE RESULT</text>
            <text className="mt-2 text-[11px] text-[#dde7e4]">Install or reload main.lynx.bundle.</text>
            <text className="mt-2 text-[10px] text-[#9baaae]">View the updated styles on iOS and Android.</text>
          </view>
        </view>
      </view>
    </scroll-view>
  )
}
