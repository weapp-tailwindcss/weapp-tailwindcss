import type { SpawnSyncReturns } from 'node:child_process'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readAndroidUiHierarchy } from './hbuilderx-local/android-runtime'

const mocks = vi.hoisted(() => ({ spawn: vi.fn() }))
vi.mock('node:child_process', async importOriginal => ({
  ...await importOriginal<typeof import('node:child_process')>(),
  spawnSync: mocks.spawn,
}))

const currentXml = '<hierarchy rotation="0"><node text="current marker" /></hierarchy>'
const staleXml = '<hierarchy rotation="0"><node text="stale marker" /></hierarchy>'
const sharedPath = '/sdcard/window.xml'
const otherPath = '/sdcard/another-task.xml'
const deviceId = 'emulator-current'

function result(stdout = '', overrides: Partial<SpawnSyncReturns<string>> = {}): SpawnSyncReturns<string> {
  return { pid: 1, output: [null, stdout, ''], status: 0, signal: null, stdout, stderr: '', ...overrides }
}

describe('Android UI 层级证据采集', () => {
  let files: Map<string, string>
  let dumpResult: SpawnSyncReturns<string>
  let catResult: SpawnSyncReturns<string> | undefined
  let cleanupResult: SpawnSyncReturns<string>
  let dumpError: Error | undefined
  let createDump: boolean

  beforeEach(() => {
    files = new Map([[sharedPath, staleXml], [otherPath, 'other task']])
    dumpResult = result('UI hierarchy dumped')
    catResult = undefined
    cleanupResult = result()
    dumpError = undefined
    createDump = true
    mocks.spawn.mockReset().mockImplementation((_command: string, args: string[]) => {
      if (args[0] === 'version') {
        return result('Android Debug Bridge')
      }
      expect(args.slice(0, 3)).toEqual(['-s', deviceId, 'shell'])
      const command = args[3]
      const remoteFile = args.at(-1)!
      if (command === 'uiautomator') {
        if (dumpError) {
          throw dumpError
        }
        if (createDump && dumpResult.status === 0 && !dumpResult.error) {
          files.set(remoteFile, currentXml)
        }
        return dumpResult
      }
      if (command === 'cat') {
        return catResult ?? (files.has(remoteFile)
          ? result(files.get(remoteFile))
          : result('', { status: 1, stderr: 'No such file' }))
      }
      if (command === 'rm') {
        expect(args.slice(3, -1)).toEqual(['rm', '-f'])
        if (cleanupResult.status === 0) {
          files.delete(remoteFile)
        }
        return cleanupResult
      }
      throw new Error(`不允许的设备命令：${args.join(' ')}`)
    })
  })

  function shellCalls() {
    return mocks.spawn.mock.calls.map(call => call[1] as string[]).filter(args => args.includes('shell'))
  }

  function expectOwnedCleanup() {
    const calls = shellCalls()
    const dumpPath = calls.find(args => args.includes('uiautomator'))!.at(-1)!
    expect(dumpPath).toMatch(/^\/sdcard\/weapp-tailwindcss-ui-[\da-f-]+\.xml$/)
    expect(calls.at(-1)).toEqual(['-s', deviceId, 'shell', 'rm', '-f', dumpPath])
    expect(calls.every(args => args.at(-1) === dumpPath)).toBe(true)
    expect(files.get(sharedPath)).toBe(staleXml)
    expect(files.get(otherPath)).toBe('other task')
    return dumpPath
  }

  it.each(['/usr/bin:/project/tools', 'C:\\Android\\platform-tools;D:\\tools', './tools'])('隔离重复采集并保持 Android 逻辑路径，不混入宿主 PATH=%s', async (hostPath) => {
    const first = await readAndroidUiHierarchy({ PATH: hostPath }, deviceId)
    const firstPath = expectOwnedCleanup()
    expect(files.has(firstPath)).toBe(false)
    mocks.spawn.mockClear()
    const second = await readAndroidUiHierarchy({ PATH: hostPath }, deviceId)
    const secondPath = expectOwnedCleanup()
    expect(secondPath).not.toBe(firstPath)
    expect([first, second]).toEqual([currentXml, currentXml])
    expect(files.has(secondPath)).toBe(false)
  })

  it.each([
    { status: 1, stderr: 'dump failed' },
    { status: null, signal: 'SIGTERM' as const, error: new Error('spawnSync ETIMEDOUT') },
    { status: 0, error: new Error('spawn failed despite exit status') },
  ])('dump 失败不读取已有旧 UI：%j', async (failure) => {
    dumpResult = result('dump diagnostics', failure)
    await expect(readAndroidUiHierarchy({}, deviceId)).rejects.toThrow(/dump/)
    expect(shellCalls().some(args => args.includes('cat'))).toBe(false)
    expectOwnedCleanup()
  })

  it('dump 抛异常也清理本次文件并保留原始异常', async () => {
    dumpError = new Error('spawn exception')
    await expect(readAndroidUiHierarchy({}, deviceId)).rejects.toBe(dumpError)
    expectOwnedCleanup()
  })

  it('dump 返回零但没有产生本轮文件时，不能读共享旧文件', async () => {
    createDump = false
    await expect(readAndroidUiHierarchy({}, deviceId)).rejects.toThrow('No such file')
    expectOwnedCleanup()
  })

  it('接受 uiautomator 的 XML 声明与完整节点', async () => {
    catResult = result(`<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>\n${currentXml}\n`)
    await expect(readAndroidUiHierarchy({}, deviceId)).resolves.toBe(catResult.stdout)
    expectOwnedCleanup()
  })

  it.each([
    result(staleXml, { status: 1, stderr: 'cat denied' }),
    result(''),
    result('  \n'),
    result('ERROR: could not get idle state'),
    result('<hierarchy><node text="stale marker" />'),
    result('<hierarchy rotation="0"></hierarchy>'),
  ])('拒绝读取失败、空白或不完整层级，防止 visual 空证据放行：%j', async (failure) => {
    catResult = failure
    await expect(readAndroidUiHierarchy({}, deviceId)).rejects.toThrow(/cat|层级/)
    expectOwnedCleanup()
  })

  it('取证成功但自身文件清理失败时仍失败', async () => {
    cleanupResult = result('cleanup output', { status: 1, stderr: 'cleanup denied' })
    await expect(readAndroidUiHierarchy({}, deviceId)).rejects.toThrow(/cleanup denied/)
    expectOwnedCleanup()
  })

  it('主体和清理失败同时保留操作、路径、进程诊断及底层异常', async () => {
    const timeout = new Error('spawnSync ETIMEDOUT')
    dumpResult = result('dump output', { status: null, signal: 'SIGTERM', error: timeout, stderr: 'dump stderr' })
    cleanupResult = result('cleanup output', { status: 1, stderr: 'cleanup stderr' })
    const error = await readAndroidUiHierarchy({}, deviceId).catch(error => error)
    expect(error).toBeInstanceOf(AggregateError)
    expect(error.errors).toHaveLength(2)
    expect(error.cause).toBe(error.errors[0])
    expect(error.errors[0].cause).toBe(timeout)
    const remoteFile = expectOwnedCleanup()
    for (const text of [remoteFile, 'dump', 'exit=null', 'SIGTERM', 'dump output', 'dump stderr', 'ETIMEDOUT']) {
      expect(error.errors[0].message).toContain(text)
    }
    for (const text of [remoteFile, 'rm', 'exit=1', 'cleanup output', 'cleanup stderr']) {
      expect(error.errors[1].message).toContain(text)
    }
  })
})
