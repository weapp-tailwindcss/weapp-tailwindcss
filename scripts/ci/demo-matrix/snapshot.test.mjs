import { Buffer } from 'node:buffer'
import { lstat, mkdir, mkdtemp, open, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { expect, it } from 'vitest'
import { snapshotOutput } from './snapshot.mjs'

it.each(['absolute', 'relative'])('证据复制允许编译器持有写入句柄，保留 %s 路径下的完整目录与二进制内容', async (kind) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'snapshot 中文-'))
  let writer
  try {
    const source = path.join(directory, 'dist')
    const destination = path.join(directory, 'evidence')
    await mkdir(path.join(source, 'pages', 'empty'), { recursive: true })
    const content = Buffer.from([0, 255, 10, 13, 128])
    const file = path.join(source, 'pages', 'bundle.js')
    await writeFile(file, content)
    await writeFile(path.join(source, '.metadata'), 'current build')
    writer = await open(file, 'r+')
    const argument = value => kind === 'relative' ? path.relative(process.cwd(), value) : value
    await snapshotOutput(argument(source), argument(destination))
    await writer.write(content, 0, content.length, 0)
    expect(await readFile(path.join(destination, 'pages', 'bundle.js'))).toEqual(content)
    expect(await readdir(path.join(destination, 'pages', 'empty'))).toEqual([])
    expect(await readFile(path.join(destination, '.metadata'), 'utf8')).toBe('current build')
  }
  finally {
    await writer?.close()
    await rm(directory, { recursive: true, force: true })
  }
})

it('证据复制保留目录链接，不递归进入链接目标', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'snapshot-link-'))
  try {
    const source = path.join(directory, 'dist')
    const destination = path.join(directory, 'evidence')
    const target = path.join(directory, 'shared')
    await mkdir(source)
    await mkdir(target)
    await writeFile(path.join(target, 'value'), 'linked')
    await symlink(target, path.join(source, 'linked'), 'junction')
    await snapshotOutput(source, destination)
    expect((await lstat(path.join(destination, 'linked'))).isSymbolicLink()).toBe(true)
    expect(await readFile(path.join(destination, 'linked', 'value'), 'utf8')).toBe('linked')
  }
  finally { await rm(directory, { recursive: true, force: true }) }
})

it('证据读取失败必须传出，不能生成看似通过的空快照', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'snapshot-missing-'))
  try {
    await expect(snapshotOutput(path.join(directory, 'missing'), path.join(directory, 'evidence'))).rejects.toMatchObject({ code: 'ENOENT' })
  }
  finally { await rm(directory, { recursive: true, force: true }) }
})
