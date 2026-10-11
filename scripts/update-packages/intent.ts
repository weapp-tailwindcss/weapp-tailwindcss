import type { DependencyState, PackageChange } from './snapshot'
import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import YAML from 'yaml'

function describeState(state: DependencyState | undefined): string {
  if (!state) {
    return '未声明'
  }
  const parts = [state.declaration]
  if (state.range !== state.declaration) {
    parts.push(`范围 ${state.range}`)
  }
  if (state.resolved) {
    parts.push(`锁定 ${state.resolved}`)
  }
  return parts.map(part => `\`${part}\``).join('，')
}

/** 使用现有 pnpm change / repoctl 消费的格式，每次独立记录升级说明。 */
export async function writeIntent(root: string, changes: PackageChange[], createId: () => string = randomUUID): Promise<string | undefined> {
  if (!changes.length) {
    return undefined
  }
  const releases = Object.fromEntries(changes.map(change => [change.name, 'patch']))
  const summary = changes.map(change => [
    `### ${change.name}`,
    '',
    ...change.dependencies.map(dep => `- 更新 ${dep.section} 中的 \`${dep.name}\`：${describeState(dep.before)} → ${describeState(dep.after)}。`),
  ].join('\n')).join('\n\n')
  const content = `---\n${YAML.stringify(releases)}---\n\n更新依赖。\n\n${summary}\n`
  const directory = path.join(root, '.changeset')
  await mkdir(directory, { recursive: true })
  for (let attempt = 0; attempt < 10; attempt++) {
    const target = path.join(directory, `dependency-update-${createId()}.md`)
    try {
      await writeFile(target, content, { flag: 'wx' })
      return target
    }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
        throw error
      }
    }
  }
  throw new Error('无法生成唯一的 changeset 文件名，已有记录未被覆盖')
}
