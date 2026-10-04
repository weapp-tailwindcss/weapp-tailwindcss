import path from 'node:path'
import { beforeEach, expect, it, vi } from 'vitest'
import { withFrameworkIdeProject } from './framework-ide/project-lifecycle'

const { readFile, writeFile, closeProject } = vi.hoisted(() => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  closeProject: vi.fn(),
}))
vi.mock('node:fs/promises', () => ({ default: { readFile, writeFile } }))
vi.mock('../scripts/wechat-project-cleanup', () => ({ closeWechatProject: closeProject }))

beforeEach(() => {
  vi.resetAllMocks()
  readFile.mockResolvedValue('original\r\nconfig\n')
})

it('探针、原绑定服务关闭和项目配置恢复失败均保留且各只执行一次', async () => {
  const first = new Error('HMR failure')
  closeProject.mockRejectedValue(new Error('close failed'))
  writeFile.mockRejectedValue(new Error('restore failed'))
  const client = { id: 'bound-client', disconnect: vi.fn() }
  const error = await withFrameworkIdeProject({
    projectPath: 'fixture',
    closeTimeoutMs: 100,
    launch: async () => client,
    run: async () => { throw first },
  }).catch(error => error)
  expect(error).toBeInstanceOf(AggregateError)
  expect(error.errors[0]).toBe(first)
  expect(error.errors).toHaveLength(3)
  expect(error.message).toContain('HMR failure')
  expect(error.message).toContain('close failed')
  expect(error.message).toContain('restore failed')
  expect(closeProject).toHaveBeenCalledExactlyOnceWith('fixture', client, 100)
  expect(writeFile).toHaveBeenCalledExactlyOnceWith(path.resolve('fixture', 'project.config.json'), 'original\r\nconfig\n')
})

it.each(['close', 'restore'] as const)('探针成功但 %s 失败时阻断验收', async (stage) => {
  (stage === 'close' ? closeProject : writeFile).mockRejectedValue(new Error(`${stage} failed`))
  await expect(withFrameworkIdeProject({
    projectPath: 'fixture',
    closeTimeoutMs: 100,
    launch: async () => ({ disconnect: vi.fn() }),
    run: async () => 'passed',
  })).rejects.toThrow(`[e2e:ide:cleanup]`)
  expect(closeProject).toHaveBeenCalledOnce()
  expect(writeFile).toHaveBeenCalledOnce()
})

it('配置快照读取失败不能启动 IDE 操作或覆盖未保存的配置', async () => {
  readFile.mockRejectedValue(Object.assign(new Error('read denied'), { code: 'EACCES' }))
  const launch = vi.fn()
  await expect(withFrameworkIdeProject({
    projectPath: 'fixture',
    closeTimeoutMs: 100,
    launch,
    run: vi.fn(),
  })).rejects.toThrow('read denied')
  expect(launch).not.toHaveBeenCalled()
  expect(closeProject).not.toHaveBeenCalled()
  expect(writeFile).not.toHaveBeenCalled()
})

it('连接获取失败仍关闭当前绑定项目并恢复已保存配置', async () => {
  const first = new Error('launch failed')
  await expect(withFrameworkIdeProject({
    projectPath: 'fixture',
    closeTimeoutMs: 100,
    launch: async () => { throw first },
    run: vi.fn(),
  })).rejects.toBe(first)
  expect(closeProject).toHaveBeenCalledExactlyOnceWith('fixture', undefined, 100)
  expect(writeFile).toHaveBeenCalledOnce()
})

it('原绑定服务返回嵌套聚合错误时，诊断保留断连和关闭的具体原因', async () => {
  closeProject.mockRejectedValue(new AggregateError([
    new Error('transport disconnect denied'),
    new Error('bound service close denied'),
  ], '执行与清理均失败'))
  const error = await withFrameworkIdeProject({
    projectPath: 'fixture',
    closeTimeoutMs: 100,
    launch: async () => ({ disconnect: vi.fn() }),
    run: async () => 'passed',
  }).catch(error => error)
  expect(error.message).toContain('transport disconnect denied')
  expect(error.message).toContain('bound service close denied')
  expect(writeFile).toHaveBeenCalledOnce()
})
