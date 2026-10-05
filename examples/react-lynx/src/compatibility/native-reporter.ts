import type { EvidenceModule, NativeEvidenceWriter } from './native-evidence'
import type { CompatibilityCase, NativeCaseResult, NativePlatformReport, NativeRect, NativeRuntimeEnvironment, Platform, StaticEvidenceReport } from './types'
import { compatibilityCases } from './catalog'
import { lynxEvidenceStrategy, requiresPixelEffect } from './evidence'
import { collectGeometry } from './geometry'
import { createNativeEvidence } from './native-evidence'
import { waitForProbeLayout } from './runtime-ready'
import staticEvidenceJson from './static-evidence.json'

interface ScreenshotResult {
  data: string
}

interface ReporterModule extends EvidenceModule {
  measure?: (id: string, callback: (value: NativeRect | null) => void) => void
  capture?: (id: string, callback: (value: string | null) => void) => void
  pointerEventsNone?: (id: string, callback: (value: boolean | number | null) => void) => void
  setPseudoActive?: (id: string, active: boolean, callback: (value: boolean | number) => void) => void
}

const staticEvidence = staticEvidenceJson as StaticEvidenceReport
const staticById = new Map(staticEvidence.results.map(result => [result.id, result]))

function currentPlatform(): Platform | undefined {
  if (SystemInfo.platform === 'iOS') {
    return 'ios'
  }
  if (SystemInfo.platform === 'Android') {
    return 'android'
  }
  return undefined
}

function runtimeEnvironment(platform: Platform): NativeRuntimeEnvironment {
  const info = SystemInfo as unknown as Record<string, unknown>
  const number = (key: string) => typeof info[key] === 'number' ? info[key] as number : 0
  const string = (key: string) => typeof info[key] === 'string' ? info[key] as string : 'unknown'
  return {
    deviceName: string('deviceModel'),
    deviceModel: string('deviceModel'),
    osName: platform === 'ios' ? 'iOS' : 'Android',
    osVersion: string('osVersion'),
    osBuild: 'unknown',
    runtimeIdentifier: 'unknown',
    abi: 'unknown',
    viewport: {
      width: number('screenWidth'),
      height: number('screenHeight'),
      pixelRatio: number('pixelRatio'),
    },
  }
}

function invoke<T>(id: string, method: string, params: Record<string, unknown>, timeout = 800) {
  return new Promise<T | undefined>((resolve) => {
    let settled = false
    const finish = (value: T | undefined) => {
      if (!settled) {
        settled = true
        resolve(value)
      }
    }
    setTimeout(finish, timeout, undefined)
    const query = lynx.createSelectorQuery()
    query.select(`#${id}`).invoke({
      method,
      params,
      success: (value: T | { code: number, data: T }) => {
        const wrapped = value && typeof value === 'object' && 'code' in value && 'data' in value
        finish(wrapped ? value.data : value as T)
      },
      fail: () => finish(undefined),
    })
    query.exec()
  })
}

function callReporter<T>(invokeReporter: (callback: (value: T) => void) => void, timeout = 2000) {
  return new Promise<T | undefined>((resolve) => {
    let settled = false
    const finish = (value: T | undefined) => {
      if (!settled) {
        settled = true
        resolve(value)
      }
    }
    setTimeout(finish, timeout, undefined)
    invokeReporter(value => finish(value))
  })
}

function measure(id: string, reporter: ReporterModule) {
  if (reporter.measure) {
    return callReporter<NativeRect | null>(callback => reporter.measure!(id, callback)).then(value => value ?? undefined)
  }
  return invoke<NativeRect>(id, 'boundingClientRect', {
    relativeTo: 'screen',
    androidEnableTransformProps: true,
  })
}

async function capture(id: string, reporter: ReporterModule) {
  if (reporter.capture) {
    const data = await callReporter<string | null>(callback => reporter.capture!(id, callback))
    return data ? { data } : undefined
  }
  return invoke<ScreenshotResult>(id, 'takeScreenshot', { format: 'png', scale: 1 })
}

function setNativeStyle(id: string, style: string) {
  const query = lynx.createSelectorQuery()
  query.select(`#${id}`).setNativeProps({ style })
  query.exec()
}

function wait(duration: number) {
  return new Promise(resolve => setTimeout(resolve, duration))
}

function nativeBoolean(value: boolean | number | null | undefined) {
  if (value === true || value === 1) {
    return true
  }
  if (value === false || value === 0) {
    return false
  }
  return undefined
}

function fingerprint(value: string) {
  let hash = 2166136261
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return `${value.length}:${(hash >>> 0).toString(16)}`
}

async function collectPixel(item: CompatibilityCase, reporter: ReporterModule, evidence: NativeEvidenceWriter): Promise<NativeCaseResult> {
  const probeId = `probe-container-${item.id}`
  const controlId = `control-container-${item.id}`
  const [styled, control] = await Promise.all([
    capture(probeId, reporter),
    capture(controlId, reporter),
  ])
  await evidence.save(`${item.id}-probe.png`, styled?.data)
  await evidence.save(`${item.id}-control.png`, control?.data)
  const captured = Boolean(styled?.data && control?.data)
  const passed = captured && fingerprint(styled!.data) !== fingerprint(control!.data)
  const pendingEffect = captured && requiresPixelEffect(item.id)
  return {
    id: item.id,
    status: pendingEffect ? 'not-tested' : passed ? 'supported' : captured ? 'unsupported' : 'not-tested',
    reason: pendingEffect ? '已采集原始截图，等待宿主验证预期效果' : passed ? undefined : captured ? 'probe/control 元素截图没有可观察的像素差异' : '原生 host 未返回完整的 probe/control 局部截图',
    failureStage: passed || !captured ? undefined : 'runtime',
    checkpoints: [{
      name: 'pixel:probe-vs-control',
      passed,
      actual: styled?.data ? fingerprint(styled.data) : 'missing',
      expected: control?.data ? `different from ${fingerprint(control.data)}` : 'control screenshot',
    }],
  }
}

async function collectInteraction(item: CompatibilityCase, reporter: ReporterModule, evidence: NativeEvidenceWriter): Promise<NativeCaseResult> {
  if (item.id === 'interaction-pointer') {
    const [styled, control] = reporter.pointerEventsNone
      ? await Promise.all([
          callReporter<boolean | number | null>(callback => reporter.pointerEventsNone!(`probe-${item.id}`, callback)),
          callReporter<boolean | number | null>(callback => reporter.pointerEventsNone!(`control-${item.id}`, callback)),
        ])
      : [undefined, undefined]
    const styledValue = nativeBoolean(styled)
    const controlValue = nativeBoolean(control)
    const measured = styledValue !== undefined && controlValue !== undefined
    const passed = styledValue === true && controlValue === false
    return {
      id: item.id,
      status: passed ? 'supported' : measured ? 'unsupported' : 'not-tested',
      reason: passed ? undefined : measured ? '原生 LynxUI 未呈现预期的 pointer-events: none' : '测试 host 缺少有效的 pointer-events 原生检查结果',
      failureStage: passed || !measured ? undefined : 'runtime',
      checkpoints: [{ name: 'interaction:pointer-events-native', passed, actual: `probe=${styled}; control=${control}`, expected: 'probe=true; control=false' }],
    }
  }
  if (item.id === 'variant-state') {
    const before = await capture(`probe-container-${item.id}`, reporter)
    const activated = reporter.setPseudoActive
      ? await callReporter<boolean | number>(callback => reporter.setPseudoActive!(`probe-${item.id}`, true, callback))
      : undefined
    await wait(120)
    const active = await capture(`probe-container-${item.id}`, reporter)
    if (reporter.setPseudoActive) {
      await callReporter<boolean | number>(callback => reporter.setPseudoActive!(`probe-${item.id}`, false, callback))
    }
    await evidence.save(`${item.id}-before.png`, before?.data)
    await evidence.save(`${item.id}-active.png`, active?.data)
    const captured = Boolean(before?.data && active?.data)
    const activatedValue = nativeBoolean(activated)
    const measured = activatedValue !== undefined && captured
    const passed = activatedValue === true && captured && fingerprint(before!.data) !== fingerprint(active!.data)
    return {
      id: item.id,
      status: passed ? 'supported' : measured ? 'unsupported' : 'not-tested',
      reason: passed ? undefined : measured ? '原生 active 伪状态前后没有产生预期像素变化' : '测试 host 未返回完整的伪状态注入或截图结果',
      failureStage: passed || !measured ? undefined : 'runtime',
      checkpoints: [{ name: 'interaction:pseudo-active', passed, actual: before?.data && active?.data ? `${fingerprint(before.data)} -> ${fingerprint(active.data)}` : 'missing' }],
    }
  }
  if (item.id === 'animation-spin') {
    const before = await capture(`probe-container-${item.id}`, reporter)
    await wait(220)
    const after = await capture(`probe-container-${item.id}`, reporter)
    await evidence.save(`${item.id}-before.png`, before?.data)
    await evidence.save(`${item.id}-after.png`, after?.data)
    const captured = Boolean(before?.data && after?.data)
    const passed = captured && fingerprint(before!.data) !== fingerprint(after!.data)
    return {
      id: item.id,
      status: passed ? 'supported' : captured ? 'unsupported' : 'not-tested',
      reason: passed ? undefined : captured ? '两个动画 checkpoint 之间没有像素变化' : '原生 host 未返回完整的动画截图序列',
      failureStage: passed || !captured ? undefined : 'runtime',
      checkpoints: [{ name: 'interaction:animation-progress', passed, actual: before?.data && after?.data ? `${fingerprint(before.data)} -> ${fingerprint(after.data)}` : 'missing' }],
    }
  }
  if (item.id === 'transition-basic') {
    const before = await capture(`probe-container-${item.id}`, reporter)
    setNativeStyle(`probe-${item.id}`, 'opacity: 0.15;')
    await wait(40)
    const during = await capture(`probe-container-${item.id}`, reporter)
    await wait(360)
    const after = await capture(`probe-container-${item.id}`, reporter)
    await evidence.save(`${item.id}-before.png`, before?.data)
    await evidence.save(`${item.id}-during.png`, during?.data)
    await evidence.save(`${item.id}-after.png`, after?.data)
    const captured = Boolean(before?.data && during?.data && after?.data)
    const passed = Boolean(
      before?.data && during?.data && after?.data
      && fingerprint(before.data) !== fingerprint(during.data)
      && fingerprint(during.data) !== fingerprint(after.data),
    )
    return {
      id: item.id,
      status: passed ? 'supported' : captured ? 'unsupported' : 'not-tested',
      reason: passed ? undefined : captured ? 'transition 的开始、中间和结束 checkpoint 未形成连续变化' : '原生 host 未返回完整的 transition 截图序列',
      failureStage: passed || !captured ? undefined : 'runtime',
      checkpoints: [{ name: 'interaction:transition-progress', passed, actual: before?.data && during?.data && after?.data ? `${fingerprint(before.data)} -> ${fingerprint(during.data)} -> ${fingerprint(after.data)}` : 'missing' }],
    }
  }
  return {
    id: item.id,
    status: 'not-tested',
    reason: '该 case 需要测试 host 注入真实触摸事件，不能用节点存在或静态截图代替',
    checkpoints: [{ name: 'interaction:native-input-required', passed: false }],
  }
}

async function collectCase(item: CompatibilityCase, reporter: ReporterModule, evidence: NativeEvidenceWriter): Promise<NativeCaseResult> {
  const staticResult = staticById.get(item.id)
  if (!staticResult?.generated || !staticResult.bundled) {
    return {
      id: item.id,
      status: 'unsupported',
      reason: staticResult?.reason ?? '构建证据不完整',
      checkpoints: [
        { name: 'generated', passed: staticResult?.generated ?? false },
        { name: 'bundled', passed: staticResult?.bundled ?? false },
      ],
    }
  }
  const strategy = lynxEvidenceStrategy(item)
  if (strategy === 'build') {
    return {
      id: item.id,
      status: 'supported',
      checkpoints: [
        { name: 'build:generated', passed: true },
        { name: 'build:bundled', passed: true },
      ],
    }
  }
  if (strategy === 'native-geometry') {
    return collectGeometry(item, id => measure(id, reporter))
  }
  if (strategy === 'interaction') {
    return collectInteraction(item, reporter, evidence)
  }
  return collectPixel(item, reporter, evidence)
}

export async function submitNativeCompatibilityReport() {
  const reporter = NativeModules.CompatibilityReporter as ReporterModule | undefined
  const platform = currentPlatform()
  if (!reporter?.submit || !platform || staticEvidence.catalogHash === 'pending-static-e2e') {
    return
  }
  const evidence = await createNativeEvidence(reporter)
  await waitForProbeLayout(id => measure(id, reporter))
  const results: NativeCaseResult[] = []
  for (const item of compatibilityCases) {
    results.push(await collectCase(item, reporter, evidence))
  }
  const report: NativePlatformReport = {
    schemaVersion: 1,
    platform,
    catalogHash: staticEvidence.catalogHash,
    verifiedAt: new Date().toISOString(),
    versions: staticEvidence.versions,
    environment: runtimeEnvironment(platform),
    results,
  }
  await evidence.submit(report)
}
