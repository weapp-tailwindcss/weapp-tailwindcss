import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { runWithCleanup } from '../scripts/e2e-preflight/cleanup'
import { createAndroidEnvironment } from './react-native/android-environment'

const directories: string[] = []
afterEach(async () => {
  await Promise.all(directories.splice(0).map(directory => fs.rm(directory, { recursive: true, force: true })))
})

async function fixture() {
  const artifacts = await fs.mkdtemp(path.join(os.tmpdir(), 'rn-android-environment-'))
  directories.push(artifacts)
  const settings = new Map([
    ['hide_error_dialogs', '0'],
    ['anr_show_background', '1'],
    ['show_first_crash_dialog', '1'],
    ['unrelated', 'private-value'],
  ])
  const reverse = new Map([['tcp:9000', 'tcp:9001']])
  const calls: string[][] = []
  const hooks: { before?: (args: string[]) => void, after?: (args: string[]) => void } = {}
  const adb = async (args: string[]) => {
    calls.push(args)
    hooks.before?.(args)
    let output = ''
    if (args[0] === 'reverse') {
      if (args[1] === '--list') {
        output = [...reverse].map(([local, remote]) => `  selected-device\t${local}  ${remote}\r\n`).join('')
      }
      else if (args[1] === '--remove') {
        reverse.delete(args[2]!)
      }
      else if (args[1] === '--no-rebind') {
        if (reverse.has(args[2]!)) {
          throw new Error('reverse already exists')
        }
        reverse.set(args[2]!, args[3]!)
      }
      else {
        throw new Error(`Unexpected reverse: ${args.join(' ')}`)
      }
    }
    else if (args[1] === 'settings') {
      if (args[2] === 'list') {
        output = [...settings].map(([key, value]) => `${key}=${value}\r\n`).join('')
      }
      else if (args[2] === 'put') {
        settings.set(args[4]!, args[5]!)
      }
      else if (args[2] === 'delete') {
        settings.delete(args[4]!)
      }
      else {
        throw new Error(`Unexpected settings: ${args.join(' ')}`)
      }
    }
    else if (args[1] === 'date') {
      output = '10-16T21:00:00.000\r\n'
    }
    else {
      throw new Error(`Unexpected adb: ${args.join(' ')}`)
    }
    hooks.after?.(args)
    return output
  }
  const environment = createAndroidEnvironment({ device: 'selected-device', ports: [43210, 8081], artifacts, adb })
  const run = (action: () => Promise<unknown> = async () => undefined) => runWithCleanup(async () => {
    await environment.prepare()
    return action()
  }, environment.restore)
  const receipt = async () => JSON.parse(await fs.readFile(path.join(artifacts, 'android-environment.json'), 'utf8'))
  return { artifacts, settings, reverse, calls, hooks, environment, run, receipt }
}

describe('Android 环境恢复事务', () => {
  it('成功运行恢复原值，保护其它端口，只记录明确设置并保留 logcat', async () => {
    const f = await fixture()
    const settings = new Map(f.settings)
    await f.run(async () => {
      expect(f.settings.get('hide_error_dialogs')).toBe('1')
      expect(f.reverse.get('tcp:8081')).toBe('tcp:8081')
    })
    expect(f.settings).toEqual(settings)
    expect(f.reverse).toEqual(new Map([['tcp:9000', 'tcp:9001']]))
    const receipt = await f.receipt()
    expect(receipt).toMatchObject({ setup: 'ready', cleanup: 'passed', logcat: { cleared: false, since: '10-16 21:00:00.000' } })
    expect(receipt.settings).toHaveLength(3)
    expect(receipt.settings.every((item: { cleanup: string, original: unknown, readback: unknown }) => item.cleanup === 'passed' && JSON.stringify(item.readback) === JSON.stringify(item.original))).toBe(true)
    expect(receipt.reverse.every((item: { cleanup: string, readback: unknown }) => item.cleanup === 'passed' && item.readback === null)).toBe(true)
    expect(JSON.stringify(receipt)).not.toContain('private-value')
    expect(f.calls).not.toContainEqual(['logcat', '-c'])
  })

  it('执行失败保留首个异常并恢复全部资源', async () => {
    const f = await fixture()
    const error = new Error('native assertion failed')
    const original = new Map(f.settings)
    await expect(f.run(async () => {
      throw error
    })).rejects.toBe(error)
    expect(f.settings).toEqual(original)
    expect(f.reverse).toEqual(new Map([['tcp:9000', 'tcp:9001']]))
    expect(await f.receipt()).toMatchObject({ setup: 'ready', cleanup: 'passed' })
  })

  it('设置命令已变更后报错，仍回滚先前与本次尝试', async () => {
    const f = await fixture()
    const original = new Map(f.settings)
    const error = new Error('settings transport failed')
    let failed = false
    f.hooks.after = (args) => {
      if (!failed && args[2] === 'put' && args[4] === 'anr_show_background') {
        failed = true
        throw error
      }
    }
    await expect(f.run()).rejects.toBe(error)
    expect(f.settings).toEqual(original)
    expect(f.reverse).toEqual(new Map([['tcp:9000', 'tcp:9001']]))
    expect(await f.receipt()).toMatchObject({ setup: 'failed', cleanup: 'passed' })
  })

  it('第二个端口创建失败仍回滚已确认创建的第一个端口', async () => {
    const f = await fixture()
    const error = new Error('reverse failed')
    f.hooks.before = (args) => {
      if (args[1] === '--no-rebind' && args[2] === 'tcp:8081') {
        throw error
      }
    }
    await expect(f.run()).rejects.toBe(error)
    expect(f.reverse).toEqual(new Map([['tcp:9000', 'tcp:9001']]))
    expect(f.calls.filter(args => args[2] === 'put')).toEqual([])
  })

  it('原始错误与恢复错误聚合，其余设置和端口仍完成清理及读回', async () => {
    const f = await fixture()
    const original = new Error('runtime failed')
    const restoreError = new Error('settings restoration failed')
    const reverseError = new Error('reverse restoration failed')
    await expect(f.run(async () => {
      f.hooks.before = (args) => {
        if (args[2] === 'put' && args[4] === 'hide_error_dialogs') {
          throw restoreError
        }
        if (args[1] === '--remove' && args[2] === 'tcp:43210') {
          throw reverseError
        }
      }
      throw original
    })).rejects.toMatchObject({ cause: original, errors: [original, { errors: expect.arrayContaining([restoreError, reverseError]) }] })
    expect(f.settings.get('anr_show_background')).toBe('1')
    expect(f.settings.get('show_first_crash_dialog')).toBe('1')
    expect(f.reverse.has('tcp:8081')).toBe(false)
    expect(f.reverse.get('tcp:9000')).toBe('tcp:9001')
    const receipt = await f.receipt()
    expect(receipt.cleanup).toBe('failed')
    expect(receipt.settings[0]).toMatchObject({ cleanup: 'failed', readback: { present: true, value: '1' } })
    expect(receipt.reverse[0]).toMatchObject({ cleanup: 'failed', readback: 'tcp:43210' })
  })

  it('命令成功却没有恢复原值时，读回验证仍失败', async () => {
    const f = await fixture()
    await expect(f.run(async () => {
      f.hooks.after = (args) => {
        if (args[2] === 'put' && args[4] === 'hide_error_dialogs') {
          f.settings.set('hide_error_dialogs', '1')
        }
      }
    })).rejects.toThrow('Android 环境恢复失败')
    expect((await f.receipt()).settings[0].errors).toEqual([expect.stringContaining('恢复读回不一致')])
  })

  it.each([undefined, 'null', 'a=b'])('区分未设置与原始字符串 %s，并完整恢复', async (value) => {
    const f = await fixture()
    if (value === undefined) {
      f.settings.delete('hide_error_dialogs')
    }
    else {
      f.settings.set('hide_error_dialogs', value)
    }
    await f.run()
    expect(f.settings.has('hide_error_dialogs')).toBe(value !== undefined)
    expect(f.settings.get('hide_error_dialogs')).toBe(value)
    expect((await f.receipt()).settings[0]).toMatchObject({
      original: { present: value !== undefined, value: value ?? null },
      readback: { present: value !== undefined, value: value ?? null },
    })
    if (value === undefined) {
      expect(f.calls).toContainEqual(['shell', 'settings', 'delete', 'global', 'hide_error_dialogs'])
    }
  })

  it('初始值已符合要求时不写入也不恢复该设置', async () => {
    const f = await fixture()
    f.settings.set('hide_error_dialogs', '1')
    f.settings.set('anr_show_background', '0')
    f.settings.set('show_first_crash_dialog', '0')
    await f.run()
    expect(f.calls.filter(args => ['put', 'delete'].includes(args[2]!))).toEqual([])
    expect((await f.receipt()).settings.every((item: { mutation: string, cleanup: string }) => item.mutation === 'skipped' && item.cleanup === 'not-needed')).toBe(true)
  })

  it.each([['tcp:43210', 'tcp:43210'], ['tcp:8081', 'tcp:8081'], ['tcp:8081', 'tcp:2222']])('已有目标端口 %s → %s 时，所有变更前阻断', async (local, remote) => {
    const f = await fixture()
    f.reverse.set(local!, remote!)
    const original = new Map(f.reverse)
    await expect(f.run()).rejects.toThrow('禁止覆盖已有映射')
    expect(f.reverse).toEqual(original)
    expect(f.calls.every(args => args[1] === '--list' || args[2] === 'list')).toBe(true)
    expect(await f.receipt()).toMatchObject({ setup: 'blocked', cleanup: 'passed' })
  })

  it('快照后出现端口竞争时禁止覆盖或移除未知资源', async () => {
    const f = await fixture()
    f.hooks.before = (args) => {
      if (args[1] === '--no-rebind' && args[2] === 'tcp:8081') {
        f.reverse.set('tcp:8081', 'tcp:8081')
      }
    }
    await expect(f.run()).rejects.toMatchObject({ errors: [expect.objectContaining({ message: 'reverse already exists' }), expect.any(AggregateError)] })
    expect(f.reverse.get('tcp:8081')).toBe('tcp:8081')
    expect(f.reverse.has('tcp:43210')).toBe(false)
    expect(f.calls).not.toContainEqual(['reverse', '--remove', 'tcp:8081'])
    expect((await f.receipt()).cleanup).toBe('failed')
  })

  it('运行中映射归属改变时不移除新资源，继续清理其它资源', async () => {
    const f = await fixture()
    await expect(f.run(async () => {
      f.reverse.set('tcp:8081', 'tcp:2222')
    })).rejects.toThrow('Android 环境恢复失败')
    expect(f.reverse).toEqual(new Map([['tcp:9000', 'tcp:9001'], ['tcp:8081', 'tcp:2222']]))
    expect(f.settings.get('hide_error_dialogs')).toBe('0')
    expect(f.calls).not.toContainEqual(['reverse', '--remove', 'tcp:8081'])
  })

  it.each([undefined, 'third-party'])('运行中设置被改成 %s 时保留第三方状态，继续其它收尾', async (value) => {
    const f = await fixture()
    await expect(f.run(async () => {
      if (value === undefined) {
        f.settings.delete('hide_error_dialogs')
      }
      else {
        f.settings.set('hide_error_dialogs', value)
      }
    })).rejects.toThrow('Android 环境恢复失败')
    expect(f.settings.get('hide_error_dialogs')).toBe(value)
    expect(f.settings.get('anr_show_background')).toBe('1')
    expect(f.reverse).toEqual(new Map([['tcp:9000', 'tcp:9001']]))
    expect(f.calls).not.toContainEqual(['shell', 'settings', 'put', 'global', 'hide_error_dialogs', '0'])
    expect((await f.receipt()).settings[0].errors).toContainEqual(expect.stringContaining('设置归属已改变'))
  })

  it('当前设置已恢复原值时不重复写入', async () => {
    const f = await fixture()
    await f.run(async () => {
      f.settings.set('hide_error_dialogs', '0')
    })
    expect(f.calls).not.toContainEqual(['shell', 'settings', 'put', 'global', 'hide_error_dialogs', '0'])
    expect((await f.receipt()).settings[0].cleanup).toBe('passed')
  })

  it('重复恢复复用同一结果，不再次修改设备', async () => {
    const f = await fixture()
    await f.environment.prepare()
    const restoration = f.environment.restore()
    await restoration
    const count = f.calls.length
    expect(f.environment.restore()).toBe(restoration)
    await f.environment.restore()
    expect(f.calls).toHaveLength(count)
    await expect(f.environment.prepare()).rejects.toThrow('不能重复准备')
  })
})
