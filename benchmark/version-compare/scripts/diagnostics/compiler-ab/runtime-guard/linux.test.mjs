import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import { link, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import linux from './linux.cjs'

async function procFixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'compiler-proc-exe-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  await mkdir(path.join(root, '100', 'task', '100'), { recursive: true })
  await mkdir(path.join(root, 'sys', 'kernel', 'random'), { recursive: true })
  const stat = (birth = '10') => `100 (native service) ${['S', '1', '100', ...Array.from({ length: 16 }, () => '0'), birth].join(' ')}`
  await writeFile(path.join(root, '100', 'stat'), stat())
  await writeFile(path.join(root, '100', 'task', '100', 'stat'), stat())
  await writeFile(path.join(root, 'sys', 'kernel', 'random', 'boot_id'), '00000000-0000-0000-0000-000000000001')
  await writeFile(path.join(root, '100', 'cmdline'), '/binary\0--service=0.21.5\0--ping\0')
  const image = path.join(root, 'mapped-image')
  const ordinary = path.join(root, 'ordinary-path')
  const executable = path.join(root, '100', 'exe')
  await writeFile(image, 'actual mapped executable')
  await writeFile(ordinary, 'replacement executable at same ordinary path')
  await link(image, executable)
  const files = { ...fs, realpathSync: file => file === executable ? ordinary : fs.realpathSync(file) }
  return { root, ordinary, executable, stat, files }
}

test('exe SHA 来自真实 /proc 映像句柄，普通路径原位替换不能错绑内容', async (t) => {
  const value = await procFixture(t)
  const identity = linux.readEntity(100, 100, { proc: value.root, executable: true, hashExecutable: true, files: value.files })
  const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')
  assert.equal(identity.executable, value.ordinary)
  assert.equal(identity.sha256, sha256('actual mapped executable'))
  assert.notEqual(identity.sha256, sha256('replacement executable at same ordinary path'))
  assert.ok(identity.executableIdentity.inode)
})

for (const name of ['exe-link', 'inode', 'birth']) {
  test(`exe 观察失败不可取得绑定资格：${name}`, async (t) => {
    const value = await procFixture(t)
    let leaderReads = 0
    const files = {
      ...value.files,
      realpathSync(file) {
        if (name === 'exe-link' && file === value.executable) throw Object.assign(new Error('exe permission'), { code: 'EACCES' })
        return value.files.realpathSync(file)
      },
      statSync(file, options) {
        const actual = fs.statSync(file, options)
        return name === 'inode' && file === value.executable ? { ...actual, ino: actual.ino + 1n } : actual
      },
      readFileSync(file, options) {
        if (name === 'birth' && file === path.join(value.root, '100', 'stat') && ++leaderReads > 1) return value.stat('11')
        return fs.readFileSync(file, options)
      },
    }
    assert.throws(() => linux.readEntity(100, 100, { proc: value.root, executable: true, hashExecutable: true, files }), /exe permission|identity changed|Invalid Linux/)
  })
}
