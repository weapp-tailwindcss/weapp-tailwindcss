import type { CompatibilityPageId } from './compatibility/catalog'
import type {
  CaseBaseline,
  CompatibilityBaseline,
  CompatibilityCase,
  FailureStage,
  RuntimeStatus,
  StaticCaseEvidence,
  StaticEvidenceReport,
} from './compatibility/types'
import { useEffect, useMemo, useState } from '@lynx-js/react'
import baselineJson from './compatibility/baseline.json'
import {
  compatibilityCases,

  compatibilityPages,
} from './compatibility/catalog'
import { submitNativeCompatibilityReport } from './compatibility/native-reporter'
import staticEvidenceJson from './compatibility/static-evidence.json'
import { featureFamilies } from './compatibility/types'
import { CaseCard } from './components/CaseCard'
import { Summary } from './components/Summary'

const baseline = baselineJson as CompatibilityBaseline
const staticEvidence = staticEvidenceJson as StaticEvidenceReport
const baselineById = new Map(baseline.results.map(result => [result.id, result]))
const staticEvidenceById = new Map(staticEvidence.results.map(result => [result.id, result]))

function environmentText(platform: 'ios' | 'android') {
  const environment = baseline.environments?.[platform]
  if (!environment) {
    return platform === 'ios' ? 'iOS 待验收' : 'Android 待验收'
  }
  const api = environment.apiLevel ? ` / API ${environment.apiLevel}` : ''
  return `${environment.deviceName} / ${environment.osName} ${environment.osVersion}${api} / ${environment.abi}`
}

export type StatusFilter = 'all' | 'supported' | 'unsupported' | 'platform' | 'not-tested'
export type FailureFilter = 'all' | FailureStage

function combinedStatus(result: CaseBaseline | undefined): StatusFilter {
  if (!result || result.ios.status === 'not-tested' || result.android.status === 'not-tested') {
    return 'not-tested'
  }
  if (result.ios.status === 'supported' && result.android.status === 'supported') {
    return 'supported'
  }
  if (result.ios.status !== result.android.status) {
    return 'platform'
  }
  return 'unsupported'
}

function resultMatchesFilter(result: CaseBaseline | undefined, filter: StatusFilter) {
  return filter === 'all' || combinedStatus(result) === filter
}

function evidenceStage(result: CaseBaseline | undefined, evidence: StaticCaseEvidence | undefined) {
  return result?.failureStage ?? evidence?.failureStage ?? (result?.ios.status === 'unsupported' || result?.android.status === 'unsupported' ? 'runtime' : undefined)
}

function statusCount(status: RuntimeStatus) {
  return baseline.results.filter(result => (
    result.ios.status === status && result.android.status === status
  )).length
}

function combinedStatusCount(status: StatusFilter) {
  return compatibilityCases.filter(item => combinedStatus(baselineById.get(item.id)) === status).length
}

export function App() {
  const [page, setPage] = useState<CompatibilityPageId>('overview')
  const [filter, setFilter] = useState<StatusFilter>('all')
  const [family, setFamily] = useState<'all' | CompatibilityCase['family']>('all')
  const [failure, setFailure] = useState<FailureFilter>('all')
  useEffect(() => {
    void submitNativeCompatibilityReport()
  }, [])
  const visibleCases = useMemo(() => compatibilityCases.filter((item) => {
    const pageMatches = page === 'overview' || item.page === page
    const familyMatches = family === 'all' || item.family === family
    const failureMatches = failure === 'all' || evidenceStage(baselineById.get(item.id), staticEvidenceById.get(item.id)) === failure
    return pageMatches && familyMatches && failureMatches && resultMatchesFilter(baselineById.get(item.id), filter)
  }), [failure, family, filter, page])

  return (
    <view className="min-h-screen bg-[#f4f7f8] text-[#172126]">
      <view className="border-b border-[#d8e0e3] bg-white px-5 pb-4 pt-6">
        <text className="text-[24px] font-bold text-[#0b1519]">Tailwind CSS 4 / Lynx</text>
        <text className="mt-1 text-[13px] text-[#526168]">
          Host
          {' '}
          {baseline.versions.lynxEngine}
          {' '}
          · bundle
          {' '}
          {baseline.versions.engineVersion}
          {' '}
          · Tailwind
          {' '}
          {baseline.versions.tailwindcss}
          {' '}
          · css-defines
          {' '}
          {baseline.versions.cssDefines}
        </text>
        <text className="mt-1 text-[11px] text-[#607178]">{environmentText('ios')}</text>
        <text className="mt-1 text-[11px] text-[#607178]">{environmentText('android')}</text>
        <view className="mt-4 flex flex-row flex-wrap gap-2">
          {compatibilityPages.map(item => (
            <view
              key={item.id}
              bindtap={() => setPage(item.id)}
              className={page === item.id ? 'nav-item nav-item-active' : 'nav-item'}
            >
              <text className={page === item.id ? 'text-[13px] font-bold text-white' : 'text-[13px] text-[#33434a]'}>{item.label}</text>
            </view>
          ))}
        </view>
      </view>

      <view className="px-5 py-4">
        <Summary
          total={compatibilityCases.length}
          supported={statusCount('supported')}
          unsupported={statusCount('unsupported')}
          platform={combinedStatusCount('platform')}
          pending={combinedStatusCount('not-tested')}
          verifiedAt={baseline.verifiedAt}
        />
        <view className="mb-4 mt-4 flex flex-row flex-wrap gap-2">
          {([
            ['all', '全部'],
            ['supported', '双端支持'],
            ['platform', '平台差异'],
            ['unsupported', '不支持'],
            ['not-tested', '待验收'],
          ] as const).map(([value, label]) => (
            <view
              key={value}
              bindtap={() => setFilter(value)}
              className={filter === value ? 'filter-item filter-item-active' : 'filter-item'}
            >
              <text className="text-[12px] text-[#26353b]">{label}</text>
            </view>
          ))}
        </view>

        <text className="filter-label">功能族</text>
        <scroll-view scroll-x className="filter-scroll">
          <view className="flex flex-row gap-2">
            {(['all', ...featureFamilies] as const).map(value => (
              <view key={value} bindtap={() => setFamily(value)} className={family === value ? 'filter-item filter-item-active' : 'filter-item'}>
                <text className="text-[12px] text-[#26353b]">{value === 'all' ? '全部功能族' : value}</text>
              </view>
            ))}
          </view>
        </scroll-view>

        <text className="filter-label">失败阶段</text>
        <view className="mb-4 flex flex-row flex-wrap gap-2">
          {([
            ['all', '全部阶段'],
            ['generation', '生成失败'],
            ['encoder', 'Encoder 删除'],
            ['runtime', '运行时不生效'],
            ['version-limit', '版本限制'],
          ] as const).map(([value, label]) => (
            <view key={value} bindtap={() => setFailure(value)} className={failure === value ? 'filter-item filter-item-active' : 'filter-item'}>
              <text className="text-[12px] text-[#26353b]">{label}</text>
            </view>
          ))}
        </view>

        <view className="compat-grid">
          {visibleCases.map(item => (
            <CaseCard
              key={item.id}
              item={item as CompatibilityCase}
              result={baselineById.get(item.id)}
              staticEvidence={staticEvidenceById.get(item.id)}
            />
          ))}
        </view>
      </view>
    </view>
  )
}
