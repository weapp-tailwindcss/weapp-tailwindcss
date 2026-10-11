import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { parse, stringify } from 'yaml'
import { repo } from '../../../scripts/ci/demo-matrix/catalog.mjs'

export async function prepareFrameworkPatches(project, lock, repository = repo) {
  const workspace = parse(await readFile(path.join(repository, 'pnpm-workspace.yaml'), 'utf8'))
  const selected = Object.entries(workspace.patchedDependencies ?? {}).filter(([key]) => lock.packages[key])
  const patches = {}
  for (const [key, file] of selected) {
    assert.ok(!/^(?:weapp-tailwindcss@|weapp-style-injector@|@weapp-tailwindcss\/)/.test(key), '不得修改被测发布包')
    const source = path.resolve(repository, file)
    const relative = path.relative(repository, source)
    assert.ok(relative && !path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`), '框架补丁超出仓库')
    const content = await readFile(source)
    const sha256 = createHash('sha256').update(content).digest('hex')
    const destination = path.join('.cost', 'framework-patches', `${sha256}.patch`)
    await mkdir(path.dirname(path.join(project, destination)), { recursive: true })
    await writeFile(path.join(project, destination), content)
    patches[key] = { path: destination, sha256, repositoryPath: file }
  }
  if (selected.length) {
    const file = path.join(project, 'pnpm-workspace.yaml')
    const config = parse(await readFile(file, 'utf8'))
    config.patchedDependencies = Object.fromEntries(Object.entries(patches).map(([key, value]) => [key, value.path]))
    await writeFile(file, stringify(config))
  }
  await mkdir(path.join(project, '.cost'), { recursive: true })
  await writeFile(path.join(project, '.cost', 'framework-patches.json'), JSON.stringify(patches, null, 2))
  return patches
}
