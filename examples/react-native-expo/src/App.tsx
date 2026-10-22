/* eslint-disable no-console, node/prefer-global/process */

import type { ViewStyle } from 'react-native'
import type { ReactNativeReport } from './compatibility/protocol'
import { tw } from '@weapp-tailwindcss/react-native/runtime'
import { useRef } from 'react'
import { ScrollView, StyleSheet, Text, useColorScheme, View } from 'react-native'
import { readHmrObservation } from './compatibility/hmr-observation.cjs'
import { nativeReportHeaders } from './compatibility/report-client'
import { assertCurrentRuntimeInstallation } from './compatibility/runtime-installation'
import { SemanticRun } from './compatibility/SemanticRun'
import evidence from './compatibility/static-evidence.json'
import { HMR_MARKER, HMR_MARKER_CLASS } from './hmr-marker'
import { measureVisualProbe } from './visual-probes'
import '@weapp-tailwindcss/react-native/env'

export default function App() {
  const reportUrl = process.env.EXPO_PUBLIC_RN_REPORT_URL
  const colorScheme = useColorScheme() ?? 'light'
  const sentRevision = useRef('')
  const cardRef = useRef<View>(null)
  const markerRef = useRef<View>(null)
  const cssRef = useRef<View>(null)
  const cssHmrStyle = StyleSheet.flatten(tw('rn-css-hmr-probe')) as { backgroundColor?: string }
  const cssHmrColor = cssHmrStyle.backgroundColor ?? 'missing'
  async function completeReport(completedReport: ReactNativeReport) {
    const revision = `${HMR_MARKER}:${cssHmrColor}`
    if (!reportUrl || completedReport.revision !== `${HMR_MARKER}-${cssHmrColor.replace('#', '')}` || sentRevision.current === revision) {
      return
    }
    if (!completedReport.runtimeInstallation) {
      throw new Error('React Native 最终报告缺少实际安装证据')
    }
    assertCurrentRuntimeInstallation(completedReport.runtimeInstallation)
    sentRevision.current = revision
    const hmrObservation = process.env.EXPO_PUBLIC_RN_HMR_INVOCATION_ID ? readHmrObservation() : undefined
    assertCurrentRuntimeInstallation(completedReport.runtimeInstallation)
    const payload = { hmrMarker: HMR_MARKER, cssHmrColor, report: completedReport, ...(hmrObservation ? { hmrObservation } : {}) }
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const visualProbes = await Promise.all([
          measureVisualProbe(cardRef.current, 'theme-card', (StyleSheet.flatten(tw(colorScheme === 'dark' ? 'bg-slate-900' : 'bg-blue-500')) as ViewStyle).backgroundColor),
          measureVisualProbe(markerRef.current, 'tsx-hmr', (StyleSheet.flatten(tw(HMR_MARKER_CLASS)) as ViewStyle).backgroundColor),
          measureVisualProbe(cssRef.current, 'css-hmr', cssHmrStyle.backgroundColor),
        ])
        const body = JSON.stringify({ ...payload, visualProbes })
        assertCurrentRuntimeInstallation(completedReport.runtimeInstallation)
        const response = await fetch(`${reportUrl}/report`, {
          method: 'POST',
          headers: nativeReportHeaders(),
          body,
        })
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`)
        }
        return
      }
      catch (error) {
        console.error(`[rn-compat] report attempt ${attempt + 1} failed`, error)
        await new Promise(resolve => setTimeout(resolve, 250 * 2 ** attempt))
      }
    }
    sentRevision.current = ''
    throw new Error('React Native report delivery failed')
  }

  return (
    <ScrollView testID="tw-rn-root" accessibilityLabel="tw-rn-root" className="flex" scrollEnabled={!reportUrl} contentContainerStyle={{ padding: 16 }}>
      <Text className="text-2xl font-bold text-slate-900">React Native Tailwind compatibility</Text>
      <View ref={cardRef} testID="tw-rn-card" accessibilityLabel="tw-rn-card" className="w-[180px] h-[48px] rounded-lg bg-blue-500 dark:bg-slate-900 ios:px-4 android:px-2">
        <Text testID="tw-rn-theme" accessibilityLabel="tw-rn-theme" className="text-white">{colorScheme === 'dark' ? 'Dark' : 'Light'}</Text>
      </View>
      <View ref={markerRef} testID="tw-rn-hmr" accessibilityLabel={HMR_MARKER} style={tw(`w-[180px] h-[24px] ${HMR_MARKER_CLASS}`)}>
        <Text className="text-white">{HMR_MARKER}</Text>
      </View>
      <View ref={cssRef} testID="tw-rn-css-hmr" accessibilityLabel={`css-hmr-${cssHmrColor}`} className="rn-css-hmr-probe w-[180px] h-[24px]">
        <Text className="text-white">css-hmr</Text>
      </View>
      <SemanticRun key={`${HMR_MARKER}:${cssHmrColor}`} evidence={evidence} revision={`${HMR_MARKER}-${cssHmrColor.replace('#', '')}`} onComplete={completeReport} />
      <Text>Tailwind RN</Text>
    </ScrollView>
  )
}
