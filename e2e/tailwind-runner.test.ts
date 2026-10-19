import { describe, expect, it } from 'vitest'
import { executionTargets, parseOptions, selectWebGroups, stageName } from './tailwind-capabilities/plan'

describe('统一 Tailwind 调度入口', () => {
  it('按实际 ID 选择 authored 和 registry，支持只选注册能力及两组共同匹配', () => {
    const authored = ['runtime/width', 'runtime/color']
    const registry = ['registry/utility/functional/w', 'registry/utility/functional/color']
    expect(selectWebGroups(/^registry\//, authored, registry)).toEqual({ authored: false, registry: true })
    expect(selectWebGroups(/color/, authored, registry)).toEqual({ authored: true, registry: true })
    expect(selectWebGroups(/width/, authored, registry)).toEqual({ authored: true, registry: false })
    expect(() => selectWebGroups(/missing/, authored, registry)).toThrow('没有匹配')
  })

  it('无预检报告不能通过目标过滤绕过全面门禁', () => {
    expect(() => parseOptions(['--target', 'web-chromium', '--case', 'width'])).toThrow('prepare --extended')
  })

  it('三浏览器分别登记普通 Web 和 Expo Web，原生两平台分别登记', () => {
    const options = parseOptions(['--preflight-report', 'current.json'])
    expect(options.targets.filter(item => item.startsWith('web-'))).toHaveLength(3)
    expect(options.targets.filter(item => item.startsWith('expo-'))).toHaveLength(3)
    for (const target of ['react-native-android', 'react-native-ios', 'lynx-android', 'lynx-ios', 'weapp', 'mini-builds']) {
      expect(options.targets).toContain(target)
    }
  })

  it('未知目标、重复目标、缺值和旧的可选门禁参数都会报错', () => {
    for (const args of [['--target', 'web'], ['--target', 'weapp,weapp'], ['--case'], ['--skip-preflight']]) {
      expect(() => parseOptions(args)).toThrow()
    }
  })

  it('原生阶段会请求已绑定设备的扩展工具链复核', () => {
    expect(stageName('react-native-ios')).toBe('React Native ios')
    expect(stageName('lynx-android')).toBe('Lynx android')
    expect(stageName('expo-firefox')).toBe('React Native web')
    expect(stageName('mini-builds')).toContain('weapp')
  })

  it('只列出目标时不要求运行环境，也不会改变选择范围', () => {
    expect(parseOptions(['--list']).targets).toEqual(executionTargets)
  })
})
