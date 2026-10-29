import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { parseAllDocuments } from 'yaml'
import { compilerIdentity, fileSha256, projectRelative, sha256 } from './identity.mjs'
import { instrument } from './instrument.mjs'
import { nativeEsbuildHelpers } from './native-helpers.mjs'
import { assertProcessesStopped, failureEvidence, processOwnership, runOwned } from './owned-process.mjs'

export const refs = Object.freeze({ current: '0637f78ed5c23a216be01a835f101074a373490f', previous: '2dd3baec854c50f53b62c24d0aae6fe4259272fb' })
export const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..')

export async function command(cwd, executable, args, capture = false) {
  let output = ''
  await runOwned(executable, args, {
    cwd, stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit', timeoutMs: 1200000,
    env: { ...process.env, CI: '1', LEFTHOOK: '0', HUSKY: '0' },
    onSpawn(child) {
      child.stdout?.on('data', chunk => { output += chunk })
      child.stderr?.on('data', chunk => process.stderr.write(chunk))
    },
  })
  return output
}

export async function prepare(outDir) {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'taro-source-ab-'))
  const roots = {}, archives = {}, locks = {}, identities = {}, nativeHelpers = {}
  try {
    const configuration = ['pnpm-lock.yaml', 'pnpm-workspace.yaml', 'package.json', path.join(projectRelative, 'package.json'), path.join(projectRelative, 'config', 'index.ts')]
    for (const [role, ref] of Object.entries(refs)) {
      const archive = path.join(temporary, `${role}.tar`)
      await command(repositoryRoot, 'git', ['archive', '--format=tar', '--output', archive, ref])
      archives[role] = { ref, archiveSha256: await fileSha256(archive) }
      const root = path.join(temporary, role)
      roots[role] = root
      await fs.mkdir(root)
      await command(temporary, 'tar', ['-xf', archive, '-C', root])
      await assert.rejects(fs.access(path.join(root, '.git')), { code: 'ENOENT' })
      assert.notEqual(await fs.realpath(root), await fs.realpath(repositoryRoot))
      await fs.mkdir(path.join(outDir, role))
      archives[role].configuration = Object.fromEntries(await Promise.all(configuration.map(async file => [file, sha256(await fs.readFile(path.join(root, file)))])))
      await fs.copyFile(path.join(root, 'pnpm-lock.yaml'), path.join(outDir, role, 'original-pnpm-lock.yaml'))
    }
    assert.deepEqual(archives.current.configuration, archives.previous.configuration, '来源 A/B 必须保持依赖、脚本、工具链和项目配置完全相同')
    for (const [role, root] of Object.entries(roots)) {
      await instrument(root, path.join(outDir, role, 'instrumentation.json'))
      await command(root, 'pnpm', ['install', '--frozen-lockfile'])
      for (const [file, expected] of Object.entries(archives[role].configuration)) assert.equal(sha256(await fs.readFile(path.join(root, file))), expected, `frozen install 不得改写准确配置：${file}`)
      const documents = parseAllDocuments(await fs.readFile(path.join(root, 'pnpm-lock.yaml'), 'utf8'))
      assert.ok(documents.every(document => !document.errors.length), '锁必须可完整解析')
      locks[role] = Object.assign({}, ...documents.map(document => document.toJS()))
      identities[role] = compilerIdentity(root, locks[role])
      nativeHelpers[role] = nativeEsbuildHelpers(root, identities[role])
      await command(root, 'pnpm', ['build:pkgs'])
    }
    const preparation = { diagnosticOnly: true, budgetAcceptance: false, label: '准确 2dd / 0637 Taro Webpack 源码 A/B', refs, archives, roots, temporary, identities, nativeHelpers, processes: processOwnership() }
    await fs.writeFile(path.join(outDir, 'preparation.json'), `${JSON.stringify(preparation, null, 2)}\n`)
    return preparation
  }
  catch (error) {
    let retainedTemporary = true
    const cleanupErrors = []
    try { assertProcessesStopped(); await fs.rm(temporary, { recursive: true, force: true }); retainedTemporary = false }
    catch (caught) { cleanupErrors.push(failureEvidence(caught)) }
    await fs.writeFile(path.join(outDir, 'preparation-error.json'), `${JSON.stringify({ roots, temporary, retainedTemporary, error: failureEvidence(error), cleanupErrors, processes: processOwnership() }, null, 2)}\n`)
    throw error
  }
}
