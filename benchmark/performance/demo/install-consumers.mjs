import assert from 'node:assert/strict'
import { cp, mkdir, symlink } from 'node:fs/promises'
import path from 'node:path'
import { inside } from './published.mjs'

export async function isolateInstallConsumers(consumers, directory) {
  const result = {}
  for (const [mode, consumer] of Object.entries(consumers)) {
    const root = path.join(directory, mode)
    assert.ok(!inside(consumer.root, root) && !inside(root, consumer.root), '安装实验目录不得与构建目录重叠')
    assert.ok(inside(consumer.root, consumer.project), '消费项目必须属于其隔离根目录')
    await mkdir(path.dirname(root), { recursive: true })
    // 保留安装脚本及其源码输入，但不复制构建已加载、可能被框架改写的依赖。
    await cp(consumer.root, root, { recursive: true, filter: source => path.basename(source) !== 'node_modules' })
    const project = path.join(root, path.relative(consumer.root, consumer.project))
    await symlink(path.join(project, 'node_modules'), path.join(root, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir')
    result[mode] = { ...consumer, root, project }
  }
  return result
}
