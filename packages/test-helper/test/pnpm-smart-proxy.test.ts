import { EventEmitter } from 'node:events'
import process from 'node:process'
import { describe, expect, it, vi } from 'vitest'

import {
  appendUpdateIgnoreSelectors,
  createPnpmEnv,
  forwardChildSignals,
  isHelpRequest,
  isWeappPackageScopedUpdate,
  readUpdateIgnoreDeps,
  refreshUpdateMetadataCache,
  shouldRefreshMetadataCache,
  terminateChild,
  UPDATE_METADATA_CACHE_PATTERNS,
} from '../../../scripts/pnpm-smart-proxy.mjs'

describe('pnpm-smart-proxy', () => {
  it('only refreshes metadata cache for pnpm update commands', () => {
    expect(shouldRefreshMetadataCache(['up', '-ri', '!@dcloudio/*'])).toBe(true)
    expect(shouldRefreshMetadataCache(['update', '-r'])).toBe(true)
    expect(shouldRefreshMetadataCache(['install'])).toBe(false)
    expect(shouldRefreshMetadataCache(['run', 'build'])).toBe(false)
  })

  it.each([['--help'], ['-h'], ['up', '--help'], ['update', '-h'], ['help', 'up']])('帮助请求 %j 不清缓存或追加升级参数', (...args) => {
    expect(shouldRefreshMetadataCache(args)).toBe(false)
    expect(appendUpdateIgnoreSelectors(args, ['vite'])).toEqual(args)
  })

  it('不把位置参数或转发参数当作帮助请求', () => {
    expect(isHelpRequest(['up', 'help'])).toBe(false)
    expect(isHelpRequest(['up', '--filter', 'help'])).toBe(false)
    expect(isHelpRequest(['up', '--', '--help'])).toBe(false)
    expect(isHelpRequest(['up', '--', '-h'])).toBe(false)
    expect(shouldRefreshMetadataCache(['--dir', 'up', 'help'])).toBe(false)
  })

  it.each([['--dir', '工作 目录', 'help', 'update'], ['-C', 'work', 'help', 'up'], ['-r', 'help', 'up'], ['--reporter', 'append-only', 'help', 'up'], ['--loglevel', 'error', 'help', 'update']])('前置全局参数 %j 不把帮助目标当作升级命令', (...args) => {
    expect(isHelpRequest(args)).toBe(true)
    expect(shouldRefreshMetadataCache(args)).toBe(false)
  })

  it.each([['--reporter', 'append-only', 'up'], ['--loglevel', 'error', 'update']])('保留带值全局参数 %j 的真实升级行为', (...args) => {
    expect(shouldRefreshMetadataCache(args)).toBe(true)
    expect(appendUpdateIgnoreSelectors(args, ['vite'])).toEqual([...args, '!vite'])
  })

  it.each(['close', 'error'])('向直接子进程转发两种信号并在 %s 后释放监听', (event) => {
    const parent = new EventEmitter()
    const child = Object.assign(new EventEmitter(), { kill: vi.fn(), pid: undefined })
    const cleanup = forwardChildSignals(child, parent as any)
    parent.emit('SIGINT')
    parent.emit('SIGTERM')
    if (process.platform !== 'win32') {
      expect(child.kill.mock.calls).toEqual([['SIGINT'], ['SIGTERM']])
    }
    child.emit(event)
    cleanup()
    expect(parent.listenerCount('SIGINT')).toBe(0)
    expect(parent.listenerCount('SIGTERM')).toBe(0)
  })

  it('Windows 只终止自己持有的子进程树并报告终止失败', () => {
    const child = { pid: 12345, exitCode: null, signalCode: null, kill: vi.fn() }
    const spawn = vi.fn(() => ({ status: 0 }))
    expect(terminateChild(child, 'SIGTERM', 'win32', spawn as any)).toBe(true)
    expect(spawn).toHaveBeenCalledWith('taskkill', ['/pid', '12345', '/t', '/f'], expect.objectContaining({ timeout: 5000, windowsHide: true }))
    expect(child.kill).not.toHaveBeenCalled()
    expect(() => terminateChild(child, 'SIGTERM', 'win32', (() => ({ status: 1 })) as any)).toThrow('终止失败')
    expect(terminateChild({ ...child, exitCode: 0 }, 'SIGTERM', 'win32', spawn as any)).toBe(false)
  })

  it('loads update ignores and appends pnpm negative selectors', () => {
    const ignoreDeps = readUpdateIgnoreDeps({
      readFileSyncImpl: () => `
update:
  ignoreDeps:
    - vite
    - '@tarojs/*'
`,
      workspaceManifestPath: 'pnpm-workspace.yaml',
    })

    expect(ignoreDeps).toEqual(['vite', '@tarojs/*'])
    expect(appendUpdateIgnoreSelectors(['up', '-rLi'], ignoreDeps)).toEqual([
      'up',
      '-rLi',
      '!vite',
      '!@tarojs/*',
    ])
    expect(appendUpdateIgnoreSelectors(['install'], ignoreDeps)).toEqual(['install'])
    expect(appendUpdateIgnoreSelectors([
      'up',
      '-rLi',
      '--filter',
      './packages/*',
    ], ['@babel/*', 'babel-*', '@tarojs/*'])).toEqual([
      'up',
      '-rLi',
      '--filter',
      './packages/*',
      '!@tarojs/*',
    ])
    expect(isWeappPackageScopedUpdate(['up', '--filter=@weapp-tailwindcss/babel'])).toBe(true)
    expect(isWeappPackageScopedUpdate(['up', '--filter', '@tarojs/*'])).toBe(false)
  })

  it('keeps Babel frozen when package and demo filters are combined', () => {
    const args = ['up', '-rLi', '--filter', './packages/*', '--filter=./demo/*']
    expect(isWeappPackageScopedUpdate(args)).toBe(false)
    expect(appendUpdateIgnoreSelectors(args, ['@babel/*', 'babel-*', '@dcloudio/*']))
      .toEqual([...args, '!@babel/*', '!babel-*', '!@dcloudio/*'])
    expect(isWeappPackageScopedUpdate(['up', '-F./packages/*', '-F./demo/web/*'])).toBe(false)
    expect(isWeappPackageScopedUpdate(['up', '--filter', '!./demo/*'])).toBe(false)
    expect(isWeappPackageScopedUpdate(['up', '--filter', './packages/*', '--filter', '!./packages/babel'])).toBe(true)
  })

  it('deletes all pnpm metadata cache before dependency updates', () => {
    const calls: Array<{ args: string[], command: string, options: unknown }> = []
    const ok = refreshUpdateMetadataCache({
      spawnSyncImpl(command: string, args: string[], options: unknown) {
        calls.push({ args, command, options })
        return { status: 0 }
      },
    })

    expect(ok).toBe(true)
    expect(calls).toHaveLength(1)
    expect(calls[0]?.command).toBe('pnpm')
    expect(calls[0]?.args).toEqual(['cache', 'delete', ...UPDATE_METADATA_CACHE_PATTERNS])
    expect(calls[0]?.options).toMatchObject({ stdio: ['ignore', 'ignore', 'inherit'] })
    expect(UPDATE_METADATA_CACHE_PATTERNS).toEqual(['*'])
  })

  it('removes ambient proxy variables when proxy is unavailable', () => {
    const env = createPnpmEnv({
      ALL_PROXY: 'http://127.0.0.1:7890',
      HTTPS_PROXY: 'http://127.0.0.1:7890',
      HTTP_PROXY: 'http://127.0.0.1:7890',
      keep: 'value',
    }, {
      proxy: { url: 'http://127.0.0.1:7890' },
      proxyAvailable: false,
    })

    expect(env.keep).toBe('value')
    expect(env.npm_config_proxy).toBe('')
    expect(env.npm_config_https_proxy).toBe('')
    expect(env.HTTP_PROXY).toBeUndefined()
    expect(env.HTTPS_PROXY).toBeUndefined()
    expect(env.ALL_PROXY).toBeUndefined()
  })
})
