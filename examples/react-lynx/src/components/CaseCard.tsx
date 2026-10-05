import type { CaseBaseline, CompatibilityCase, ExpectedDeclaration, RuntimeStatus, StaticCaseEvidence } from '../compatibility/types'

function statusLabel(status: RuntimeStatus | undefined) {
  if (status === 'supported') {
    return '支持'
  }
  if (status === 'unsupported') {
    return '不支持'
  }
  return '待验收'
}

function statusClass(status: RuntimeStatus | undefined) {
  if (status === 'supported') {
    return 'status-badge status-supported'
  }
  if (status === 'unsupported') {
    return 'status-badge status-unsupported'
  }
  return 'status-badge status-pending'
}

function declarationsText(declarations: ExpectedDeclaration[]) {
  return declarations.map(declaration => (
    `${declaration.property}${declaration.value ? `: ${declaration.value}` : ''}${declaration.important ? ' !important' : ''}`
  )).join('; ')
}

// 这些像素用例验证文字自身的样式，不依赖 view 到 text 的可选 CSS 继承。
const textUtilityCases = new Set(['type-weight-style', 'type-decoration', 'syntax-opacity-modifier', 'syntax-type-hint'])

function ProbeBody({ id, textClassName = '' }: { id: string, textClassName?: string }) {
  return (
    <>
      <text className={`probe-target target ${textClassName}`}>Tw4</text>
      <view id={`probe-child-${id}-a`} className="probe-child probe-child-a" />
      <view id={`probe-child-${id}-b`} className="probe-child probe-child-b" />
    </>
  )
}

export function CaseCard({ item, result, staticEvidence }: { item: CompatibilityCase, result?: CaseBaseline, staticEvidence?: StaticCaseEvidence }) {
  const generated = result?.generated ?? staticEvidence?.generated
  const bundled = result?.bundled ?? staticEvidence?.bundled
  const failureStage = result?.failureStage ?? staticEvidence?.failureStage
  const usesCaptureFrame = item.evidence === 'runtime' && item.probe !== 'geometry'
  const pairClass = usesCaptureFrame ? 'probe-pair probe-capture-pair' : 'probe-pair'
  const textClassName = textUtilityCases.has(item.id) ? item.className : ''
  const viewClassName = textUtilityCases.has(item.id) ? '' : item.className
  return (
    <view className="case-card">
      <view className="flex flex-row items-start justify-between gap-3">
        <view className="grow">
          <text className="text-[15px] font-bold text-[#132026]">{item.title}</text>
          <text className="mt-1 text-[11px] text-[#6b7a80]">
            {item.family}
            {' '}
            ·
            {' '}
            {item.probe}
          </text>
        </view>
        <view className="items-end gap-1">
          <view className={statusClass(result?.ios.status)}>
            <text className="status-text">
              iOS
              {statusLabel(result?.ios.status)}
            </text>
          </view>
          <view className={statusClass(result?.android.status)}>
            <text className="status-text">
              Android
              {statusLabel(result?.android.status)}
            </text>
          </view>
        </view>
      </view>

      {item.className
        ? <text className="class-code">{item.className}</text>
        : <text className="class-code">构建指令</text>}
      <text className="evidence-code">
        期望 CSS：
        {declarationsText(item.declarations) || '指令入口完整编译'}
      </text>
      {staticEvidence && (
        <>
          <text className="evidence-code">
            generated CSS：
            {declarationsText(staticEvidence.generatedDeclarations) || '无声明'}
          </text>
          <text className="evidence-code">
            bundled CSS：
            {declarationsText(staticEvidence.bundledDeclarations) || '无声明'}
          </text>
        </>
      )}
      <view className="mt-2 flex flex-row flex-wrap gap-2">
        <view className={generated ? 'status-badge status-supported' : 'status-badge status-unsupported'}>
          <text className="status-text">
            generated
            {generated === undefined ? '待验证' : generated ? 'yes' : 'no'}
          </text>
        </view>
        <view className={bundled ? 'status-badge status-supported' : 'status-badge status-unsupported'}>
          <text className="status-text">
            bundled
            {bundled === undefined ? '待验证' : bundled ? 'yes' : 'no'}
          </text>
        </view>
        {failureStage && <view className="status-badge status-unsupported"><text className="status-text">{failureStage}</text></view>}
      </view>

      <view className={`probe-shell probe-fixture-${item.id}`}>
        <view className={item.id === 'variant-dark' ? `${pairClass} dark` : pairClass}>
          <view id={`probe-container-${item.id}`} flatten={false} className={usesCaptureFrame ? 'probe-slot probe-capture' : 'probe-slot'}>
            <view id={`probe-${item.id}`} className={`compat-probe ${viewClassName}`}>
              <ProbeBody id={item.id} textClassName={textClassName} />
            </view>
            {item.id === 'layout-z-index' && <view className="probe-z-overlay" />}
          </view>
          <view id={`control-container-${item.id}`} flatten={false} className={usesCaptureFrame ? 'probe-slot probe-control-slot probe-capture' : 'probe-slot probe-control-slot'}>
            <view id={`control-${item.id}`} className="compat-probe">
              <ProbeBody id={`control-${item.id}`} />
            </view>
            {item.id === 'layout-z-index' && <view className="probe-z-overlay" />}
          </view>
        </view>
      </view>

      {result?.ios.reason && (
        <text className="mt-2 text-[11px] text-[#a33b2d]">
          iOS：
          {result.ios.reason}
        </text>
      )}
      {result?.android.reason && (
        <text className="mt-2 text-[11px] text-[#a33b2d]">
          Android：
          {result.android.reason}
        </text>
      )}
      {staticEvidence?.reason && <text className="mt-2 text-[11px] text-[#a33b2d]">{staticEvidence.reason}</text>}
      {item.alternative && (
        <text className="mt-2 text-[11px] text-[#365b67]">
          替代：
          {item.alternative}
        </text>
      )}
    </view>
  )
}
