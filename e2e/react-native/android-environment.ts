import fs from 'node:fs/promises'
import path from 'node:path'
import { execa } from 'execa'

type Adb = (args: string[]) => Promise<string>
type Mutation = 'pending' | 'skipped' | 'attempted' | 'applied'
type Cleanup = 'pending' | 'not-needed' | 'passed' | 'failed'
interface SettingValue { present: boolean, value: string | null }
interface Resource<T> {
  original: T | undefined
  mutation: Mutation
  cleanup: Cleanup
  readback?: T
  errors: string[]
}
interface ReverseMapping { local: string, remote: string }
interface Options { device: string, ports: number[], artifacts: string, adb?: Adb }

const desiredSettings = { hide_error_dialogs: '1', anr_show_background: '0', show_first_crash_dialog: '0' }

function selectedSettings(output: string) {
  const values = new Map<string, SettingValue>()
  for (const key of Object.keys(desiredSettings)) {
    values.set(key, { present: false, value: null })
  }
  for (const line of output.split(/\r?\n/)) {
    const separator = line.indexOf('=')
    const key = line.slice(0, separator)
    if (separator < 0 || !values.has(key)) {
      continue
    }
    if (values.get(key)!.present) {
      throw new Error(`重复的 Android 设置：${key}`)
    }
    values.set(key, { present: true, value: line.slice(separator + 1) })
  }
  return values
}

function reverseMappings(output: string): ReverseMapping[] {
  return output.split(/\r?\n/).filter(line => line.trim()).map((line) => {
    const fields = line.trim().split(/\s+/)
    if (fields.length !== 3) {
      throw new Error('无法确认 Android reverse 映射格式')
    }
    return { local: fields[1]!, remote: fields[2]! }
  })
}

function sameSetting(actual: SettingValue, expected: SettingValue) {
  return actual.present === expected.present && actual.value === expected.value
}

/** 只借用绑定设备的明确设置和空闲端口；所有变更均留下独立恢复回执。 */
export function createAndroidEnvironment({ device, ports, artifacts, adb }: Options) {
  if (!device.trim() || ports.some(port => !Number.isInteger(port) || port < 1 || port > 65535)) {
    throw new Error('Android 环境事务需要明确设备和有效端口')
  }
  const execute: Adb = adb ?? (async (args) => {
    // adb 会重拼远端命令；此处只引用 Android shell 参数，不使用宿主 shell。
    const command = args[0] === 'shell'
      ? ['shell', ...args.slice(1).map(value => `'${value.replaceAll('\'', '\'\\\'\'')}'`)]
      : args
    const result = await execa('adb', ['-s', device, ...command], { timeout: 30_000 })
    return result.stdout
  })
  const settings = Object.entries(desiredSettings).map(([key, desired]) => ({
    key,
    desired,
    original: undefined,
    mutation: 'pending',
    cleanup: 'not-needed',
    errors: [],
  } as Resource<SettingValue> & { key: string, desired: string }))
  const reverse = [...new Set(ports)].map(port => ({
    local: `tcp:${port}`,
    remote: `tcp:${port}`,
    original: undefined,
    mutation: 'pending',
    cleanup: 'not-needed',
    errors: [],
  } as Resource<string | null> & ReverseMapping))
  const receipt = {
    schemaVersion: 1,
    device,
    setup: 'pending' as 'pending' | 'ready' | 'failed' | 'blocked',
    cleanup: 'pending' as 'pending' | 'passed' | 'failed',
    settings,
    reverse,
    logcat: { cleared: false, since: '' },
    errors: [] as string[],
  }
  const persist = () => fs.writeFile(path.join(artifacts, 'android-environment.json'), `${JSON.stringify(receipt, null, 2)}\n`, 'utf8')
  let prepared = false
  let restoration: Promise<void> | undefined

  async function prepare() {
    if (prepared || restoration) {
      throw new Error('Android 环境事务不能重复准备或在恢复后准备')
    }
    prepared = true
    try {
      const mappings = reverseMappings(await execute(['reverse', '--list']))
      const originalSettings = selectedSettings(await execute(['shell', 'settings', 'list', 'global']))
      for (const setting of settings) {
        setting.original = originalSettings.get(setting.key)!
      }
      for (const mapping of reverse) {
        const matches = mappings.filter(item => item.local === mapping.local)
        if (matches.length > 1) {
          throw new Error(`重复的 Android reverse 映射：${mapping.local}`)
        }
        mapping.original = matches[0]?.remote ?? null
      }
      const occupied = reverse.filter(mapping => mapping.original !== null)
      if (occupied.length) {
        receipt.setup = 'blocked'
        throw new Error(`Android reverse 端口已被占用，禁止覆盖已有映射：${occupied.map(item => item.local).join(', ')}`)
      }
      const deviceTime = (await execute(['shell', 'date', '+%m-%dT%H:%M:%S.000'])).trim()
      if (!/^\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.000$/.test(deviceTime)) {
        throw new Error('无法确认本轮 Android logcat 的设备时间边界')
      }
      receipt.logcat.since = deviceTime.replace('T', ' ')
      await persist()
      for (const mapping of reverse) {
        mapping.mutation = 'attempted'
        mapping.cleanup = 'pending'
        await persist()
        await execute(['reverse', '--no-rebind', mapping.local, mapping.remote])
        mapping.mutation = 'applied'
      }
      for (const setting of settings) {
        if (setting.original!.present && setting.original!.value === setting.desired) {
          setting.mutation = 'skipped'
          continue
        }
        setting.mutation = 'attempted'
        setting.cleanup = 'pending'
        await persist()
        await execute(['shell', 'settings', 'put', 'global', setting.key, setting.desired])
        setting.mutation = 'applied'
      }
      receipt.setup = 'ready'
      await persist()
    }
    catch (error) {
      if (receipt.setup !== 'blocked') {
        receipt.setup = 'failed'
      }
      receipt.errors.push(String(error))
      try {
        await persist()
      }
      catch (writeError) {
        throw new AggregateError([error, writeError], 'Android 准备与回执写入均失败', { cause: error })
      }
      throw error
    }
  }

  async function restoreResources() {
    const errors: unknown[] = []
    async function attempt(resource: { errors: string[] }, action: () => Promise<void>) {
      try {
        await action()
      }
      catch (error) {
        resource.errors.push(String(error))
        errors.push(error)
      }
    }
    for (const setting of settings) {
      if (setting.cleanup !== 'pending' && setting.mutation !== 'skipped') {
        continue
      }
      await attempt(setting, async () => {
        const original = setting.original!
        const current = selectedSettings(await execute(['shell', 'settings', 'list', 'global'])).get(setting.key)!
        if (sameSetting(current, original)) {
          return
        }
        if (setting.mutation === 'skipped' || !current.present || current.value !== setting.desired) {
          throw new Error(`Android 设置归属已改变，禁止覆盖：${setting.key}`)
        }
        await execute(original.present
          ? ['shell', 'settings', 'put', 'global', setting.key, original.value!]
          : ['shell', 'settings', 'delete', 'global', setting.key])
      })
      await attempt(setting, async () => {
        setting.readback = selectedSettings(await execute(['shell', 'settings', 'list', 'global'])).get(setting.key)!
        if (!sameSetting(setting.readback, setting.original!)) {
          throw new Error(`Android 设置恢复读回不一致：${setting.key}`)
        }
      })
      setting.cleanup = setting.errors.length ? 'failed' : setting.mutation === 'skipped' ? 'not-needed' : 'passed'
    }
    for (const mapping of reverse) {
      if (mapping.cleanup !== 'pending') {
        continue
      }
      await attempt(mapping, async () => {
        const matches = reverseMappings(await execute(['reverse', '--list'])).filter(item => item.local === mapping.local)
        if (matches.length === 0) {
          return
        }
        if (mapping.mutation !== 'applied') {
          throw new Error(`Android reverse 创建结果不明确，禁止移除未知归属映射：${mapping.local}`)
        }
        if (matches.length !== 1 || matches[0]!.remote !== mapping.remote) {
          throw new Error(`Android reverse 映射归属已改变，禁止移除：${mapping.local}`)
        }
        await execute(['reverse', '--remove', mapping.local])
      })
      await attempt(mapping, async () => {
        const matches = reverseMappings(await execute(['reverse', '--list'])).filter(item => item.local === mapping.local)
        mapping.readback = matches[0]?.remote ?? null
        if (matches.length || mapping.readback !== mapping.original) {
          throw new Error(`Android reverse 恢复读回不一致：${mapping.local}`)
        }
      })
      mapping.cleanup = mapping.errors.length ? 'failed' : 'passed'
    }
    receipt.cleanup = errors.length ? 'failed' : 'passed'
    await attempt(receipt, persist)
    if (errors.length) {
      receipt.cleanup = 'failed'
      throw new AggregateError(errors, 'Android 环境恢复失败')
    }
  }

  return {
    receipt,
    prepare,
    restore: () => restoration ??= restoreResources(),
  }
}
