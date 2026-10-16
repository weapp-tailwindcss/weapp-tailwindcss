import process from 'node:process'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  settings: new Map<string, string>([['hide_error_dialogs', '0']]),
  reverse: new Map<string, string>([['tcp:9000', 'tcp:9001']]),
  files: new Map<string, string>(),
  commands: [] as string[][],
  rawCommands: [] as string[][],
  close: vi.fn(),
  publish: vi.fn(),
  closeError: undefined as Error | undefined,
  listenError: undefined as Error | undefined,
  setupError: new Error('settings preparation failed'),
}))

vi.mock('node:http', () => ({
  createServer: () => {
    let failed: ((error: Error) => void) | undefined
    const server = {
      listening: false,
      once: (_event: string, listener: (error: Error) => void) => { failed = listener },
      listen: (_port: number, _host: string, ready: () => void) => {
        queueMicrotask(() => {
          if (state.listenError) {
            failed!(state.listenError)
          }
          else {
            server.listening = true
            ready()
          }
        })
      },
      address: () => ({ port: 43210 }),
      close: (closed: (error?: Error) => void) => {
        state.close()
        server.listening = false
        closed(state.closeError)
      },
    }
    return server
  },
}))
vi.mock('node:fs/promises', () => ({
  default: {
    rm: vi.fn(),
    mkdir: vi.fn(),
    readFile: async () => 'original source',
    writeFile: async (file: string, contents: string) => { state.files.set(file, contents) },
  },
}))
vi.mock('./react-native/runtime-artifacts', () => ({
  createRuntimeArtifacts: async () => ({ directory: 'mock-evidence', publish: state.publish }),
}))
vi.mock('./react-native/native-toolchain', () => ({ reactNativeAndroidToolchain: async () => ({}) }))
vi.mock('./react-native/android-device', () => ({ androidExpoDevice: async () => 'selected-avd' }))
vi.mock('./react-native/reports', () => ({ validateReactNativeReport: vi.fn() }))
vi.mock('./react-native/metro-evidence', () => ({ captureMetroEvidence: vi.fn() }))
vi.mock('execa', () => ({
  execa: async (command: string, args: string[]) => {
    if (command !== 'adb') {
      throw new Error(`Unexpected process: ${command}`)
    }
    expect(args.slice(0, 2)).toEqual(['-s', 'selected-device'])
    state.rawCommands.push(args)
    const action = args.slice(2).map(value => value.startsWith('\'') ? value.slice(1, -1).replaceAll('\'\\\'\'', '\'') : value)
    state.commands.push(action)
    let stdout = ''
    if (action[0] === 'reverse') {
      if (action[1] === '--list') {
        stdout = [...state.reverse].map(([local, remote]) => `selected-device ${local} ${remote}`).join('\n')
      }
      else if (action[1] === '--remove') {
        state.reverse.delete(action[2]!)
      }
      else if (action[1] === '--no-rebind') {
        state.reverse.set(action[2]!, action[3]!)
      }
      else {
        state.reverse.set(action[1]!, action[2]!)
      }
    }
    else if (action[1] === 'settings') {
      const key = action[4]!
      if (action[2] === 'list') {
        stdout = [...state.settings].map(([name, value]) => `${name}=${value}`).join('\n')
      }
      if (action[2] === 'get') {
        stdout = state.settings.get(key) ?? 'null'
      }
      if (action[2] === 'delete') {
        state.settings.delete(key)
      }
      if (action[2] === 'put') {
        if (key === 'anr_show_background' && action[5] === '0') {
          throw state.setupError
        }
        state.settings.set(key, action[5]!)
      }
    }
    else if (action[1] === 'date') {
      stdout = '10-16T21:00:00.000'
    }
    else if (action[1] === 'getprop') {
      stdout = 'mock-native-device'
    }
    else {
      throw new Error(`Unexpected adb command: ${action.join(' ')}`)
    }
    return { stdout, stderr: '', exitCode: 0 }
  },
}))

const originalArgv = [...process.argv]
beforeEach(() => {
  vi.resetModules()
  state.settings = new Map([['hide_error_dialogs', '0']])
  state.reverse = new Map([['tcp:9000', 'tcp:9001']])
  state.files.clear()
  state.commands.length = 0
  state.rawCommands.length = 0
  state.close.mockClear()
  state.publish.mockClear()
  state.closeError = undefined
  state.listenError = undefined
  vi.stubEnv('RN_ANDROID_DEVICE_ID', 'selected-device')
  process.argv = ['node', 'run-native.ts', 'android']
})
afterEach(() => {
  process.argv = originalArgv
  vi.unstubAllEnvs()
})

it('Android 准备中途失败仍恢复设置与端口并关闭报告服务', async () => {
  await expect(import('./react-native/run-native')).rejects.toBe(state.setupError)
  expect(state.settings).toEqual(new Map([['hide_error_dialogs', '0']]))
  expect(state.reverse).toEqual(new Map([['tcp:9000', 'tcp:9001']]))
  expect(state.close).toHaveBeenCalledOnce()
  expect(state.publish).toHaveBeenCalledOnce()
  expect(state.commands).not.toContainEqual(['logcat', '-c'])
  const receipt = [...state.files.entries()].find(([file]) => file.endsWith('android-environment.json'))
  expect(JSON.parse(receipt![1])).toMatchObject({ device: 'selected-device', setup: 'failed', cleanup: 'passed' })
})

it('报告服务清理失败仍恢复 Android，聚合原始错误并发布回执', async () => {
  state.closeError = new Error('reporter cleanup failed')
  await expect(import('./react-native/run-native')).rejects.toMatchObject({
    cause: state.setupError,
    errors: [state.setupError, { errors: [state.closeError] }],
  })
  expect(state.settings).toEqual(new Map([['hide_error_dialogs', '0']]))
  expect(state.reverse).toEqual(new Map([['tcp:9000', 'tcp:9001']]))
  expect(state.close).toHaveBeenCalledOnce()
  expect(state.publish).toHaveBeenCalledOnce()
  const receipt = [...state.files.entries()].find(([file]) => file.endsWith('android-environment.json'))
  expect(JSON.parse(receipt![1]).cleanup).toBe('passed')
})

it('报告端口异步绑定失败会拒绝 ready，在任何设备变更前退出并发布证据', async () => {
  state.listenError = new Error('listen failed')
  await expect(import('./react-native/run-native')).rejects.toBe(state.listenError)
  expect(state.settings).toEqual(new Map([['hide_error_dialogs', '0']]))
  expect(state.reverse).toEqual(new Map([['tcp:9000', 'tcp:9001']]))
  expect(state.commands.every(action => action[1] === 'getprop')).toBe(true)
  expect(state.close).not.toHaveBeenCalled()
  expect(state.publish).toHaveBeenCalledOnce()
})

it('真实 adb argv 对原始设置值保留空格、引号及 shell 替换符的字面值', async () => {
  const original = 'a b\'c$(literal)`tick`'
  state.settings.set('hide_error_dialogs', original)
  await expect(import('./react-native/run-native')).rejects.toBe(state.setupError)
  expect(state.settings.get('hide_error_dialogs')).toBe(original)
  expect(state.rawCommands).toContainEqual([
    '-s',
    'selected-device',
    'shell',
    '\'settings\'',
    '\'put\'',
    '\'global\'',
    '\'hide_error_dialogs\'',
    '\'a b\'\\\'\'c$(literal)`tick`\'',
  ])
})
