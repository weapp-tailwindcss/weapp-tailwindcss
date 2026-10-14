import { chmod, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { create } from 'tar'
import { afterEach, expect, it, vi } from 'vitest'
import { verifyPackedPackages } from '../scripts/verify-packed-packages.mjs'

const workspace = vi.hoisted(() => ({ packages: vi.fn() }))
vi.mock('repoctl', () => ({ getWorkspacePackages: workspace.packages }))
const roots: string[] = []

afterEach(async () => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  workspace.packages.mockReset()
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

it('公开包 manifest 检查沿用活动 pnpm，不被 PATH 中另一版本替换', async () => {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'packed manifest pnpm ')))
  roots.push(root)
  const source = path.join(root, 'source package')
  const archiveRoot = path.join(root, 'archive')
  const bin = path.join(root, 'global bin')
  const active = path.join(root, 'active entry', 'pnpm.cjs')
  const archive = path.join(root, 'fixture.tgz')
  const record = path.join(root, 'calls.jsonl')
  await Promise.all([source, path.join(archiveRoot, 'package'), bin, path.dirname(active)].map(directory => mkdir(directory, { recursive: true })))
  const manifest = { name: 'fixture-packed-manifest', version: '1.0.0' }
  await writeFile(path.join(archiveRoot, 'package', 'package.json'), JSON.stringify(manifest))
  await create({ cwd: archiveRoot, file: archive, gzip: true }, ['package'])
  const cli = (version: string) => `const fs = require('node:fs'); const path = require('node:path');
const args = process.argv.slice(2);
fs.appendFileSync(process.env.PACKED_MANIFEST_RECORD, JSON.stringify({ version: '${version}', args, cwd: process.cwd() }) + '\\n');
const destination = args[args.indexOf('--pack-destination') + 1];
fs.copyFileSync(process.env.PACKED_MANIFEST_ARCHIVE, path.join(destination, 'fixture.tgz'));
`
  await writeFile(active, cli('99.1.0'))
  const dispatch = path.join(bin, 'dispatch.cjs')
  await writeFile(dispatch, cli('99.2.0'))
  if (process.platform === 'win32') {
    await writeFile(path.join(bin, 'pnpm.cmd'), `@"${process.execPath}" "${dispatch}" %*\r\n`)
  }
  else {
    const shim = path.join(bin, 'pnpm')
    await writeFile(shim, '#!/usr/bin/env node\nrequire("./dispatch.cjs")\n')
    await chmod(shim, 0o755)
  }
  vi.stubEnv('npm_execpath', active)
  vi.stubEnv('PACKED_MANIFEST_RECORD', record)
  vi.stubEnv('PACKED_MANIFEST_ARCHIVE', archive)
  vi.stubEnv('PATH', [bin, path.dirname(process.execPath), process.env['PATH']].filter(Boolean).join(path.delimiter))
  workspace.packages.mockResolvedValue([{ rootDir: source, manifest }])
  vi.spyOn(console, 'log').mockImplementation(() => undefined)
  await expect(verifyPackedPackages(root)).resolves.toEqual([manifest.name])
  const calls = (await readFile(record, 'utf8')).trim().split('\n').map(line => JSON.parse(line))
  expect(calls).toHaveLength(1)
  expect(calls[0]).toMatchObject({ version: '99.1.0', cwd: source })
  expect(calls[0].args.slice(0, 2)).toEqual(['pack', '--pack-destination'])
})
