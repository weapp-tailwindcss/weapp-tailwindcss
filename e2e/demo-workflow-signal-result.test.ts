import type { ChildProcess } from 'node:child_process'
import { EventEmitter } from 'node:events'
import process from 'node:process'
import { afterEach, expect, it, vi } from 'vitest'
import * as table from '../scripts/demo-e2e-workflow/process-table'
import { createWorkflowProcessTree } from '../scripts/demo-e2e-workflow/process-tree'
import { formatWorkflowError } from '../scripts/e2e-preflight/cleanup'

const command = vi.hoisted(() => vi.fn())
vi.mock('../scripts/demo-e2e-workflow/process-command', () => ({ runProcessCommand: command }))
const platform = process.platform
afterEach(() => {
  Object.defineProperty(process, 'platform', { value: platform })
  vi.restoreAllMocks()
  vi.resetAllMocks()
})

async function fixture(target = 'linux') {
  Object.defineProperty(process, 'platform', { value: target })
  const root = { pid: 100, parent: 1, group: target === 'win32' ? 0 : 100, started: '2026-10-04T08:09:00Z' }
  let rows = [root]
  const scan = vi.spyOn(table, 'readProcessTable').mockImplementation(async () => rows)
  const subsetScan = vi.spyOn(table, 'readProcessSubset').mockImplementation(async () => rows)
  const child = Object.assign(new EventEmitter(), { pid: root.pid, exitCode: null, signalCode: null }) as ChildProcess
  let close!: () => void
  const closed = new Promise<void>((resolve) => {
    close = resolve
  })
  const finish = (closeChild = true) => {
    rows = []
    Object.assign(child, { exitCode: 0 })
    if (closeChild) {
      close()
    }
  }
  const tree = createWorkflowProcessTree(child, closed, { cleanupMs: 30 })
  await tree.capture()
  return { root, finish, tree, scan, subsetScan }
}

it('已核对目标在发信号前自然退出，ESRCH 后确认空树则不伪报强制终止', async () => {
  const { tree, finish, scan, subsetScan } = await fixture()
  const kill = vi.spyOn(process, 'kill').mockImplementation(() => {
    finish()
    throw Object.assign(new Error('kill ESRCH'), { code: 'ESRCH' })
  })
  await expect(tree.stop()).resolves.toBeUndefined()
  expect(kill).toHaveBeenCalledExactlyOnceWith(100, 'SIGTERM')
  expect(scan).toHaveBeenCalledTimes(2)
  expect(subsetScan).toHaveBeenCalledTimes(2)
})

it.each(['nonempty', 'open-pipes'])('ESRCH 后 %s 未完成时继续阻断', async (state) => {
  const { tree, finish } = await fixture()
  vi.spyOn(process, 'kill').mockImplementation(() => {
    if (state === 'open-pipes') {
      finish(false)
    }
    throw Object.assign(new Error('kill ESRCH'), { code: 'ESRCH' })
  })
  const error = await tree.stop().catch(error => error)
  expect(error).toBeInstanceOf(AggregateError)
  expect(error.message).toContain('有界清理未成功')
  expect(formatWorkflowError(error)).not.toContain('已向本轮进程发送终止请求')
})

it('ESRCH 不代表归属已清空，后续无法复查仍保留失败', async () => {
  const { tree, finish, subsetScan } = await fixture()
  const failure = new Error('final ownership scan failed')
  vi.spyOn(process, 'kill').mockImplementation(() => {
    finish()
    subsetScan.mockRejectedValue(failure)
    throw Object.assign(new Error('kill ESRCH'), { code: 'ESRCH' })
  })
  const error = await tree.stop().catch(error => error)
  expect(error).toBeInstanceOf(AggregateError)
  expect(error.errors).toContain(failure)
})

it.each(['linux', 'win32'])('%s 发送失败保留原始原因，不能记成成功终止', async (target) => {
  const { tree, finish } = await fixture(target)
  const failure = Object.assign(new Error('permission denied'), { code: 'EPERM' })
  const fail = () => {
    finish()
    throw failure
  }
  if (target === 'win32') {
    command.mockImplementation(fail)
  }
  else {
    vi.spyOn(process, 'kill').mockImplementation(fail)
  }
  const error = await tree.stop().catch(error => error)
  expect(error.errors).toEqual([failure])
  expect(formatWorkflowError(error)).not.toContain('已向本轮进程发送终止请求')
})

it.each(['linux', 'win32'])('%s 成功发送后仍阻断，并记录所核对的 PID、启动时间与信号', async (target) => {
  const { tree, finish, root } = await fixture(target)
  if (target === 'win32') {
    command.mockImplementation(async () => {
      finish()
      return ''
    })
  }
  else {
    vi.spyOn(process, 'kill').mockImplementation(() => {
      finish()
      return true
    })
  }
  const error = await tree.stop().catch(error => error)
  expect(error).toBeInstanceOf(AggregateError)
  const detail = formatWorkflowError(error)
  expect(detail).toContain('已向本轮进程发送终止请求')
  expect(detail).toContain(`pid=${root.pid}`)
  expect(detail).toContain(`started=${root.started}`)
  expect(detail).toContain(`method=${target === 'win32' ? 'taskkill /pid /f' : 'SIGTERM'}`)
})

it('成功发送后等待 close 超时，最终失败同样保留发送目标', async () => {
  const { tree, finish, root } = await fixture()
  vi.spyOn(process, 'kill').mockImplementation(() => {
    finish(false)
    return true
  })
  const error = await tree.stop().catch(error => error)
  expect(error.message).toContain('有界清理未成功')
  const detail = formatWorkflowError(error)
  expect(detail).toContain('已向本轮进程发送终止请求')
  expect(detail).toContain(`pid=${root.pid} started=${root.started} method=SIGTERM`)
})

it('目标 PID 复用时不发送，也不生成成功发送记录', async () => {
  const { tree, finish, root, subsetScan } = await fixture()
  finish()
  subsetScan.mockResolvedValue([{ ...root, started: '2026-10-04T08:09:01Z' }])
  const kill = vi.spyOn(process, 'kill').mockReturnValue(true)
  const error = await tree.stop().catch(error => error)
  expect(error).toBeInstanceOf(AggregateError)
  expect(formatWorkflowError(error)).toContain('缺少仍匹配的身份锚')
  expect(formatWorkflowError(error)).not.toContain('已向本轮进程发送终止请求')
  expect(kill).not.toHaveBeenCalled()
})
