import { useEffect, useState } from '@lynx-js/react'
import { buildStates, nextBuildState, recentBuilds } from './model'

const statePanelClasses = [
  'mt-4 rounded-[18px] border border-[#2c383c] bg-[#171e20] p-4',
  'mt-4 rounded-[18px] border border-[#0e6582] bg-[#10252c] p-4',
  'mt-4 rounded-[18px] border border-[#16734b] bg-[#10241b] p-4',
] as const

const stateTextClasses = [
  'text-[12px] font-bold text-[#aebdc2]',
  'text-[12px] font-bold text-[#70d7f5]',
  'text-[12px] font-bold text-[#75dfa6]',
] as const

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
  const [activeState, setActiveState] = useState(0)
  const build = buildStates[activeState]

  useEffect(() => {
    const timer = setInterval(() => setActiveState(current => nextBuildState(current)), 2200)
    return () => clearInterval(timer)
  }, [])

  return (
    <scroll-view scroll-y className="min-h-screen bg-[#0d1112] text-[#edf4f1]">
      <view className="pb-8 pl-5 pr-5 pt-[72px]">
        <view className="flex flex-row items-center justify-between">
          <view>
            <text className="text-[11px] font-bold text-[#75dfa6]">WEAPP TAILWINDCSS</text>
            <text className="mt-2 text-[26px] font-bold text-[#f1f6f4]">Lynx Build Console</text>
          </view>
          <view className="rounded-[12px] border border-[#2d3a3e] bg-[#182023] pb-2 pl-3 pr-3 pt-2">
            <text className="text-[11px] font-bold text-[#b8c6ca]">main</text>
          </view>
        </view>

        <view className={statePanelClasses[activeState]}>
          <view className="flex flex-row items-center justify-between">
            <text className={stateTextClasses[activeState]}>{build.label}</text>
            <text className="text-[25px] font-bold text-[#f4f8f6]">{build.progress}</text>
          </view>
          <text className="mt-3 text-[11px] text-[#87979c]">{build.detail}</text>
          <view className="mt-4 h-[4px] overflow-hidden rounded-[4px] bg-[#273337]">
            <view
              className={activeState === 0
                ? 'h-[4px] w-[42%] bg-[#0ea5e9]'
                : activeState === 1
                  ? 'h-[4px] w-[76%] bg-[#0ea5e9]'
                  : 'h-[4px] w-full bg-[#07c160]'}
            />
          </view>
        </view>

        <view className="mt-4 flex flex-row justify-between">
          <Metric label="GENERATED CSS" value="38.4 KB" detail="theme + utilities" />
          <Metric label="BUILD TIME" value="1.24s" detail="development bundle" />
        </view>

        <view className="mt-4 rounded-[18px] border border-[#263236] bg-[#151b1d] p-4">
          <view className="flex flex-row items-center justify-between">
            <text className="text-[13px] font-bold text-[#e8efed]">Native targets</text>
            <text className="text-[10px] text-[#718187]">same component code</text>
          </view>
          <view className="mt-4 flex flex-row justify-between">
            <view className="w-[48%] rounded-[12px] bg-[#1c2528] p-3">
              <text className="text-[11px] font-bold text-[#75dfa6]">iOS</text>
              <text className="mt-2 text-[10px] text-[#9baaae]">Lynx Engine 4.0.1</text>
            </view>
            <view className="w-[48%] rounded-[12px] bg-[#1c2528] p-3">
              <text className="text-[11px] font-bold text-[#75dfa6]">Android</text>
              <text className="mt-2 text-[10px] text-[#9baaae]">Lynx Engine 4.0.1</text>
            </view>
          </view>
        </view>

        <text className="mb-3 mt-6 text-[12px] font-bold text-[#829196]">RECENT BUILDS</text>
        {recentBuilds.map((item, index) => (
          <view key={item.branch} className={index === 0 ? 'rounded-[14px] bg-[#17201d] p-4' : 'mt-2 rounded-[14px] bg-[#151b1d] p-4'}>
            <view className="flex flex-row items-center justify-between">
              <text className="text-[12px] font-bold text-[#dde7e4]">{item.branch}</text>
              <text className="text-[10px] font-bold text-[#75dfa6]">{item.status}</text>
            </view>
            <text className="mt-2 text-[10px] text-[#718187]">
              {item.duration}
              {'  /  '}
              {item.utilities}
              {' utilities'}
            </text>
          </view>
        ))}
      </view>
    </scroll-view>
  )
}
