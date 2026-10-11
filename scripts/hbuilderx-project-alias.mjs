import { createHash, randomUUID } from 'node:crypto'
import { mkdir, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import process from 'node:process'

export function createHBuilderXProjectAliasName(projectRoot, processId = process.pid) {
  const resolvedRoot = resolve(projectRoot)
  const rootHash = createHash('sha256').update(resolvedRoot).digest('hex').slice(0, 10)
  const projectName = basename(resolvedRoot).replace(/[^\w.-]+/g, '-')
  return `${projectName}-${rootHash}-${processId}`
}

export async function createHBuilderXProjectAlias(projectRoot, aliasRoot = join(tmpdir(), 'weapp-tailwindcss-hbuilderx-projects')) {
  const projectName = `${createHBuilderXProjectAliasName(projectRoot)}-${randomUUID()}`
  const aliasDirectory = resolve(aliasRoot)
  const projectPath = join(aliasDirectory, projectName)
  await mkdir(aliasDirectory, { recursive: true })
  await symlink(resolve(projectRoot), projectPath, process.platform === 'win32' ? 'junction' : 'dir')
  return {
    projectName,
    projectPath,
    async cleanup() {
      await rm(projectPath, { recursive: true, force: true })
    },
  }
}
