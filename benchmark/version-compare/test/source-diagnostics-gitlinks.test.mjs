import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { extractArchive, readGitIdentity } from '../scripts/source-diagnostics/git-source.mjs'

const temporary = []
afterEach(async () => {
  for (const directory of temporary.splice(0)) {
    await fs.rm(directory, { recursive: true, force: true })
  }
})
const commit = '1'.repeat(40)
const tree = '2'.repeat(40)
const blob = '3'.repeat(40)
const gitCommit = '4'.repeat(40)
const read = rows => readGitIdentity(async label => ({ stdout: ({ commit, tree, 'object-format': 'sha1', 'ls-tree': `${rows.join('\0')}\0` })[label] }), 'not-accessed-by-injected-run', commit)

it('gitlink 引用不是 blob，不要求其 commit 对象存在于父仓库', async () => {
  const identity = await read([`100644 blob ${blob}\tpackage.json`, `160000 commit ${gitCommit}\tsubmodules/known`])
  expect(identity.files).toEqual([{ logical: 'package.json', mode: '100644', gitBlob: blob }])
  expect(identity.gitlinks).toEqual([{ logical: 'submodules/known', mode: '160000', gitCommit }])
})
it.each(['160000 blob', '100644 commit', '040000 tree', '100664 blob'])('未知或错误 Git mode/type 仍拒绝：%s', async (pair) => {
  await expect(read([`100644 blob ${blob}\tpackage.json`, `${pair} ${gitCommit}\tsubmodules/known`])).rejects.toThrow('mode/type')
})
it.each(['File', 'Directory'])('归档不得在 gitlink 下导出 %s', async (type) => {
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'source-gitlink-archive-'))
  temporary.push(parent)
  const archive = path.join(parent, 'archive.tar')
  await fs.writeFile(archive, 'injected archive listing fixture')
  const identity = await read([`100644 blob ${blob}\tpackage.json`, `160000 commit ${gitCommit}\tsubmodules/known`])
  let extracted = false
  const tar = {
    async t({ onReadEntry }) {
      onReadEntry({ type, path: 'submodules/known/unexpected', size: 0, mode: 0o755, resume() {} })
    },
    async x() { extracted = true },
  }
  await expect(extractArchive({ archive, root: path.join(parent, 'product'), identity, tar, manifestFile: path.join(parent, 'manifest.json') })).rejects.toThrow('归档')
  expect(extracted).toBe(false)
})
