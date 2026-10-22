import type { ThemeOverridePhase } from '../compatibility/theme-overrides-contract'
import { useEffect, useState } from '@lynx-js/react'
import { bindThemeOverrideController } from '../compatibility/native-theme-overrides'
import { themeOverrideContract as contract, themeOverrideId } from '../compatibility/theme-overrides-contract'

/** 独立字面值对照不继承被测变量；每个状态有可观察的新节点身份与标尺。 */
export function ThemeOverrideProbes() {
  const [phase, setPhase] = useState<ThemeOverridePhase>('before')
  useEffect(() => bindThemeOverrideController(setPhase), [])
  return (
    <view className={`theme-evidence-fixtures theme-evidence-${phase}`} flatten={false}>
      {contract.branches.map((branch) => {
        const id = themeOverrideId(branch, phase)
        return (
          <view key={branch} className="theme-evidence-pair" flatten={false}>
            <view className={phase === 'after' ? 'theme-dark' : 'theme-evidence-base'} flatten={false}>
              <view id={`probe-container-${id}`} className="theme-evidence-canvas" flatten={false}>
                <view id={`probe-${id}`} className={`theme-evidence-panel ${branch === 'tailwind-hex' ? 'bg-brand' : `theme-variable-${branch}`}`} flatten={false}>
                  <view id={`probe-child-${id}-a`} className="theme-evidence-marker" flatten={false} />
                </view>
              </view>
            </view>
            <view id={`control-container-${id}`} className="theme-evidence-canvas" flatten={false}>
              <view id={`control-${id}`} className={`theme-evidence-panel theme-reference-${phase === 'after' ? 'blue' : branch}`} flatten={false}>
                <view id={`probe-child-control-${id}-a`} className="theme-evidence-marker" flatten={false} />
              </view>
            </view>
          </view>
        )
      })}
    </view>
  )
}
