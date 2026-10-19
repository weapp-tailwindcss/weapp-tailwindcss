/* eslint-disable node/prefer-global/process */

import type { StyleProp, TextStyle, ViewStyle } from 'react-native'
import type { NativeCaseReceipt, NativePairEvidence, NativeRect, ReactNativeCaseResult, ReactNativeReport } from './protocol'
import { composeStyle, tw } from '@weapp-tailwindcss/react-native/runtime'
import { useEffect, useRef, useState } from 'react'
import { Dimensions, PixelRatio, Platform, StyleSheet, Text, View } from 'react-native'
import { expectedFixtureStyle, fixtureClassValue, nativeFixtures, styleContains } from './protocol'

interface RuntimeInput {
  schemaVersion?: number
  fixtureHash?: string
  cases: Array<{ id: string, className: string }>
  report: unknown
}

function measure(node: View | Text | null): Promise<NativeRect> {
  if (!node) {
    return Promise.reject(new Error('Missing semantic fixture node'))
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Semantic fixture measurement timed out')), 5_000)
    node.measureInWindow((x, y, width, height) => {
      clearTimeout(timer)
      resolve({ x, y, width, height })
    })
  })
}

export function SemanticRun({ evidence, revision, onComplete }: { evidence: RuntimeInput, revision: string, onComplete: (report: ReactNativeReport) => void | Promise<void> }) {
  const tests = evidence.cases.flatMap(item => nativeFixtures[item.id]
    ? (nativeFixtures[item.id]!.phases ?? ['default']).map(phase => ({ ...item, phase }))
    : [])
  const [index, setIndex] = useState(0)
  const probe = useRef<View>(null)
  const reference = useRef<View>(null)
  const control = useRef<View>(null)
  const target = useRef<View | Text>(null)
  const referenceTarget = useRef<View | Text>(null)
  const controlTarget = useRef<View | Text>(null)
  const receipts = useRef<NativeCaseReceipt[]>([])
  const runId = useRef('')
  const checkpoints = useRef(new Map<string, ReactNativeCaseResult['checkpoints']>())
  const active = tests[index]
  const fixture = active && nativeFixtures[active.id]
  const scheme = active?.phase === 'dark' || active?.phase === 'dark-ios' ? 'dark' : 'light'
  const platform = Platform.OS as 'ios' | 'android' | 'web'
  const inlineStyle = active?.phase.startsWith('inline-') ? { color: '#654321' } : undefined
  const actualStyle = active ? StyleSheet.flatten(composeStyle(tw(fixtureClassValue(active.className, active.id, active.phase), { colorScheme: scheme, platform }), inlineStyle)) as Record<string, unknown> : {}
  const expectedStyle = active ? expectedFixtureStyle(active.id, active.phase, platform) ?? {} : {}

  useEffect(() => {
    if (!active) {
      return
    }
    let canceled = false
    const reportUrl = process.env.EXPO_PUBLIC_RN_REPORT_URL
    if (!reportUrl) {
      return
    }
    void (async () => {
      if (evidence.schemaVersion !== 2) {
        throw new Error('Historical static evidence is not runnable: regenerate the RN static fixture first')
      }
      const contextResponse = await fetch(`${reportUrl}/context`)
      const context = await contextResponse.json() as { runId: string, fixtureHash: string, catalogHash: string, versions: Record<string, string> }
      runId.current = context.runId
      const staticReport = evidence.report as ReactNativeReport
      if (context.fixtureHash !== evidence.fixtureHash || context.catalogHash !== staticReport.catalogHash
        || JSON.stringify(context.versions) !== JSON.stringify(staticReport.versions)) {
        throw new Error('Stale RN static evidence or dependency versions')
      }
      // 等待本轮节点提交并稳定绘制；宿主还会核验连续两帧原生像素。
      await new Promise(resolve => setTimeout(resolve, 350))
      if (canceled) {
        return
      }
      const [probeRect, referenceRect, targetRect, referenceTargetRect, controlRect, controlTargetRect] = await Promise.all([
        measure(probe.current),
        measure(reference.current),
        measure(target.current),
        measure(referenceTarget.current),
        measure(control.current),
        measure(controlTarget.current),
      ])
      const viewport = Dimensions.get('window')
      const pair: NativePairEvidence = {
        runId: context.runId,
        platform,
        revision,
        id: active.id,
        phase: active.phase,
        probe: probeRect,
        reference: referenceRect,
        target: targetRect,
        referenceTarget: referenceTargetRect,
        control: controlRect,
        controlTarget: controlTargetRect,
        viewport: { width: viewport.width, height: viewport.height, pixelRatio: PixelRatio.get() },
      }
      const response = await fetch(`${reportUrl}/case`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(pair) })
      if (!response.ok) {
        throw new Error(`Native pair receipt HTTP ${response.status}: ${await response.text()}`)
      }
      const receipt = await response.json() as NativeCaseReceipt
      if (canceled) {
        return
      }
      receipts.current.push(receipt)
      const stylePassed = styleContains(actualStyle, expectedStyle)
        && (active.id !== 'variant-dark' || Object.keys(expectedStyle).length > 0 || actualStyle.color === undefined)
      const observed = [
        ...(checkpoints.current.get(active.id) ?? []),
        { name: `runtime:${active.phase}:style`, passed: stylePassed, actual: JSON.stringify(actualStyle), expected: JSON.stringify(expectedStyle) },
        ...receipt.checkpoints,
      ]
      checkpoints.current.set(active.id, observed)
      if (index + 1 < tests.length) {
        setIndex(index + 1)
        return
      }
      const results = staticReport.results.map((result) => {
        const runtime = checkpoints.current.get(result.id)
        if (!runtime) {
          return result
        }
        const passed = result.generated && result.encoded && !result.warnings.length && runtime.every(checkpoint => checkpoint.passed)
        return { ...result, status: passed ? 'supported' as const : 'failed' as const, reason: passed ? undefined : '本轮原生语义或参考节点像素不匹配', checkpoints: [...result.checkpoints, ...runtime] }
      })
      await onComplete({ ...staticReport, runId: context.runId, revision, stage: 'runtime', platform: Platform.OS as ReactNativeReport['platform'], verifiedAt: new Date().toISOString(), results, receipts: receipts.current, environment: { deviceName: `${Platform.OS}-runtime`, osName: Platform.OS, osVersion: String(Platform.Version), runtimeIdentifier: `expo-${Platform.OS}`, abi: Platform.OS === 'web' ? 'n/a' : 'simulator', viewport: pair.viewport } })
    })().catch(async (error) => {
      if (!canceled) {
        if (evidence.schemaVersion === 2 && runId.current) {
          const staticReport = evidence.report as ReactNativeReport
          await onComplete({
            ...staticReport,
            runId: runId.current,
            revision,
            stage: 'runtime',
            platform,
            verifiedAt: new Date().toISOString(),
            receipts: receipts.current,
            results: staticReport.results.map(result => result.id === active.id
              ? { ...result, status: 'failed', reason: String(error), checkpoints: [...result.checkpoints, { name: `runtime:${active.phase}:failure`, passed: false, actual: String(error) }] }
              : result),
          })
        }
        await fetch(`${reportUrl}/error`, { method: 'POST', body: String(error) }).catch(() => undefined)
      }
    })
    return () => {
      canceled = true
    }
  }, [index])

  if (!active || !fixture) {
    return null
  }
  const base = fixture.component === 'text'
    ? { color: '#113355', fontSize: 14, backgroundColor: '#c026d3' }
    : { width: 80, height: active.id === 'layout-aspect' ? undefined : 40, backgroundColor: '#c026d3' }
  const children = fixture.children
    ? (
        <>
          <View style={{ width: 20, height: 12, backgroundColor: '#facc15' }} />
          <View style={{ width: active.id === 'layout-overflow' ? 120 : 24, height: 16, backgroundColor: '#2563eb' }} />
        </>
      )
    : undefined
  const render = (side: 'probe' | 'reference' | 'control') => {
    const frameRef = side === 'probe' ? probe : side === 'reference' ? reference : control
    const targetRef = side === 'probe' ? target : side === 'reference' ? referenceTarget : controlTarget
    const style = [base, fixture.base, side === 'control' ? undefined : side === 'reference' ? expectedStyle : actualStyle] as StyleProp<ViewStyle & TextStyle>
    return (
      <View ref={frameRef} testID={`tw-rn-case-${side}`} accessibilityLabel={`${active.id}:${active.phase}`} collapsable={false} style={{ width: 160, height: 128, padding: 16, position: 'relative', backgroundColor: '#e2e8f0' }}>
        {fixture.component === 'text'
          ? <Text ref={(node) => { targetRef.current = node }} style={style}>Tailwind 23</Text>
          : <View ref={(node) => { targetRef.current = node }} style={style}>{children}</View>}
        {active.id === 'layout-z-index' && <View style={{ position: 'absolute', top: 24, left: 24, width: 40, height: 40, backgroundColor: '#facc15', zIndex: 1 }} />}
      </View>
    )
  }
  return (
    <View testID="tw-rn-semantic-pair">
      <Text>
        {active.id}
        {' '}
        /
        {' '}
        {active.phase}
      </Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {render('probe')}
        {render('reference')}
      </View>
      {render('control')}
    </View>
  )
}
