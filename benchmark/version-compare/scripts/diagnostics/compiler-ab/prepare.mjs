import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { compilerIdentity, fileSha256, sha256 } from './identity.mjs'
import { auditLockAxis, baselineRef, compilerOverrides, compilerSnapshot, compilerVersions, previousCompanions, projectRelative } from './lock-axis.mjs'
import { auditLockDocuments, parseLockDocuments } from './lock-documents.mjs'
import { auditOptionalCliIsolation, isolateOptionalCliWorkspace } from './optional-cli.mjs'
import { nativeEsbuildHelpers } from './native-helpers.mjs'
import { auditBunyanMetadataSides, bunyanMetadataReference, collectBunyanSource } from './tool-metadata.mjs'
import { assertProcessesStopped, failureEvidence, processOwnership, runOwned } from './owned-process.mjs'

export const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..')

export async function command(cwd, executable, args, options = {}) {
  let output = ''
  let error = ''
  try {
    await runOwned(executable, args, {
      cwd, stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit', timeoutMs: options.timeoutMs ?? 1200000,
      env: { ...process.env, CI: '1', LEFTHOOK: '0', HUSKY: '0', ...options.env },
      onSpawn(child) {
        child.stdout?.on('data', chunk => { output += chunk })
        child.stderr?.on('data', chunk => { error += chunk })
      },
    })
  }
  catch (caught) { caught.stderr = error; throw caught }
  return output
}

async function archive(archiveFile, directory) {
  await fs.mkdir(directory)
  await command(path.dirname(directory), 'tar', ['-xf', archiveFile, '-C', directory], { timeoutMs: 120000 })
}

export async function assertTemporaryRoot(root, sourceRoot) {
  assert.notEqual(await fs.realpath(root), await fs.realpath(sourceRoot), '拒绝向源工作树写入')
  await assert.rejects(fs.access(path.join(root, '.git')), { code: 'ENOENT' }, '临时副本不得包含 Git 元数据')
}

export function previousWorkspace(document, companions, patchFile) {
  for (const [selector, version] of Object.entries(compilerOverrides(companions))) document.setIn(['overrides', selector], version)
  document.setIn(['patchedDependencies', `webpack@${compilerVersions.previous}`], patchFile)
  return document
}

export function previousProjectManifest(manifest) {
  assert.equal(manifest.devDependencies?.webpack, compilerVersions.current, '只允许替换目标 demo 的准确 Webpack 声明')
  return { ...manifest, devDependencies: { ...manifest.devDependencies, webpack: compilerVersions.previous } }
}

export async function prepare(outDir) {
  const { parseDocument } = await import('yaml')
  const sourceRef = (await command(repositoryRoot, 'git', ['rev-parse', 'HEAD'], { capture: true, timeoutMs: 30000 })).trim()
  assert.match(sourceRef, /^[a-f\d]{40}$/)
  const baselineLockSource = await command(repositoryRoot, 'git', ['show', `${baselineRef}:pnpm-lock.yaml`], { capture: true, timeoutMs: 30000 })
  const accurateBaseline = parseLockDocuments(baselineLockSource).lock
  const baselineWorkspace = parseDocument(await command(repositoryRoot, 'git', ['show', `${baselineRef}:pnpm-workspace.yaml`], { capture: true, timeoutMs: 30000 }))
  const patchFile = baselineWorkspace.getIn(['patchedDependencies', `webpack@${compilerVersions.previous}`])
  assert.equal(typeof patchFile, 'string', '准确基线必须包含对应 Webpack 补丁')
  const patch = await command(repositoryRoot, 'git', ['show', `${baselineRef}:${patchFile}`], { capture: true, timeoutMs: 30000 })
  const expected = previousCompanions(accurateBaseline)
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'taro-compiler-ab-'))
  const roots = Object.fromEntries(Object.keys(compilerVersions).map(role => [role, path.join(temporary, role)]))
  await fs.mkdir(outDir, { recursive: true })
  try {
    const archiveFile = path.join(temporary, 'source.tar')
    await command(repositoryRoot, 'git', ['archive', '--format=tar', '--output', archiveFile, sourceRef], { timeoutMs: 120000 })
    for (const root of Object.values(roots)) {
      await archive(archiveFile, root)
      await assertTemporaryRoot(root, repositoryRoot)
    }
    const originalLock = await fs.readFile(path.join(roots.current, 'pnpm-lock.yaml'))
    const originalLockSha256 = sha256(originalLock)
    await fs.writeFile(path.join(outDir, 'original-pnpm-lock.yaml'), originalLock)
    const originalDocuments = parseLockDocuments(originalLock.toString())
    const currentWorkspaceFile = path.join(roots.current, 'pnpm-workspace.yaml')
    await fs.writeFile(path.join(outDir, 'original-pnpm-workspace.yaml'), await fs.readFile(currentWorkspaceFile))
    const metadataSource = await collectBunyanSource(path.join(outDir, 'tool-metadata-source'))
    const currentWorkspace = String(isolateOptionalCliWorkspace(parseDocument(await fs.readFile(currentWorkspaceFile, 'utf8'))))
    await fs.writeFile(currentWorkspaceFile, currentWorkspace)
    await command(roots.current, 'pnpm', ['install', '--lockfile-only', '--no-frozen-lockfile', '--ignore-scripts'])
    const currentLock = await fs.readFile(path.join(roots.current, 'pnpm-lock.yaml'))
    const currentLockSha256 = sha256(currentLock)
    const currentDocuments = parseLockDocuments(currentLock.toString())
    auditLockDocuments(originalDocuments, currentDocuments)
    const normalization = bunyanMetadataReference(originalDocuments.lock, currentDocuments.lock, metadataSource)
    assert.equal(normalization.receipt.runtime.fixtureOverride, false, '真实诊断不得采用 fixture 注入的运行版本')
    await fs.writeFile(path.join(outDir, 'tool-metadata-normalization.json'), `${JSON.stringify(normalization.receipt, null, 2)}\n`)
    await fs.writeFile(path.join(outDir, 'tool-metadata-comparison-reference.json'), `${JSON.stringify(normalization.reference, null, 2)}\n`)
    const isolation = auditOptionalCliIsolation(normalization.reference, currentDocuments.lock)
    assert.equal(await fs.readFile(currentWorkspaceFile, 'utf8'), currentWorkspace, '安装不得改写当前隔离配置')
    await fs.writeFile(path.join(roots.previous, 'pnpm-lock.yaml'), currentLock)
    await fs.copyFile(currentWorkspaceFile, path.join(roots.previous, 'pnpm-workspace.yaml'))
    const manifestFile = path.join(roots.previous, projectRelative, 'package.json')
    const originalManifest = await fs.readFile(manifestFile)
    const previousManifest = `${JSON.stringify(previousProjectManifest(JSON.parse(originalManifest)), null, 2)}\n`
    await fs.writeFile(manifestFile, previousManifest)
    const workspaceFile = path.join(roots.previous, 'pnpm-workspace.yaml')
    const document = previousWorkspace(parseDocument(await fs.readFile(workspaceFile, 'utf8')), expected, patchFile)
    const previousWorkspaceSource = String(document)
    await fs.writeFile(workspaceFile, previousWorkspaceSource)
    const patchPath = path.resolve(roots.previous, patchFile)
    assert.ok(path.relative(roots.previous, patchPath) && !path.relative(roots.previous, patchPath).startsWith('..'), '补丁必须位于副本内')
    await fs.writeFile(patchPath, patch)
    await command(roots.previous, 'pnpm', ['install', '--lockfile-only', '--no-frozen-lockfile', '--ignore-scripts'])
    const previousLockSha256 = sha256(await fs.readFile(path.join(roots.previous, 'pnpm-lock.yaml')))
    assert.equal(await fs.readFile(workspaceFile, 'utf8'), previousWorkspaceSource, '安装不得改写旧编译器配套配置')
    for (const [role, root] of Object.entries(roots)) {
      const evidenceDir = path.join(outDir, role)
      await fs.mkdir(evidenceDir)
      for (const file of ['pnpm-lock.yaml', 'pnpm-workspace.yaml']) await fs.copyFile(path.join(root, file), path.join(evidenceDir, file))
      await fs.copyFile(path.join(root, projectRelative, 'package.json'), path.join(evidenceDir, 'target-package.json'))
    }
    assert.equal(sha256(await fs.readFile(path.join(roots.current, 'pnpm-lock.yaml'))), currentLockSha256, '当前派生锁不允许变化')
    const documents = Object.fromEntries(await Promise.all(Object.entries(roots).map(async ([role, root]) => [role, parseLockDocuments(await fs.readFile(path.join(root, 'pnpm-lock.yaml'), 'utf8'))])))
    const locks = auditLockDocuments(documents.current, documents.previous)
    const axis = auditLockAxis(locks.current, locks.previous, accurateBaseline)
    const normalizedSides = auditBunyanMetadataSides(normalization.reference, locks)
    await fs.writeFile(path.join(outDir, 'lock-precheck.json'), `${JSON.stringify({ sourceRef, originalLockSha256, currentLockSha256, previousLockSha256, normalization: normalization.receipt, normalizedSides, isolation, axis }, null, 2)}\n`)
    for (const [role, root] of Object.entries(roots)) {
      await command(root, 'pnpm', ['install', '--frozen-lockfile'])
      const installed = await fs.readFile(path.join(root, 'pnpm-lock.yaml'))
      assert.equal(sha256(installed), role === 'current' ? currentLockSha256 : previousLockSha256, '完整 frozen install 不得变化派生锁：' + role)
      assert.equal(await fs.readFile(path.join(root, 'pnpm-workspace.yaml'), 'utf8'), role === 'current' ? currentWorkspace : previousWorkspaceSource, '完整 frozen install 不得变化配置：' + role)
      auditBunyanMetadataSides(normalization.reference, { [role]: parseLockDocuments(installed.toString()).lock })
    }
    assert.equal(sha256(originalLock), originalLockSha256, '原锁 Buffer 不得变化')
    assert.equal(sha256(await fs.readFile(path.join(outDir, 'original-pnpm-lock.yaml'))), originalLockSha256, '原锁归档字节不得变化')
    assert.deepEqual(originalDocuments.lock, parseLockDocuments(originalLock.toString()).lock, '原锁逻辑对象不得变化')
    const identities = {}, nativeHelpers = {}
    for (const [role, root] of Object.entries(roots)) {
      const companions = Object.fromEntries(Object.entries(compilerSnapshot(locks[role], compilerVersions[role]).snapshot.dependencies).map(([name, ref]) => [name, ref.split('(')[0]]))
      identities[role] = compilerIdentity(root, role, companions)
      nativeHelpers[role] = nativeEsbuildHelpers(root, identities[role])
    }
    assert.equal(identities.current.configSha256, identities.previous.configSha256)
    assert.deepEqual(identities.current.terserImplementation, identities.previous.terserImplementation, '两侧 Terser 实现必须相同')
    const preparation = {
      schemaVersion: 3, diagnosticOnly: true, sourceRef, baselineRef, originalLockSha256, currentLockSha256, previousLockSha256, isolation,
      label: 'Webpack 编译器及其可选 esbuild peer 上下文 A/B',
      sourceArchiveSha256: await fileSha256(archiveFile),
      patch: { file: patchFile, sha256: sha256(patch), baselineRef },
      manifestAxis: { file: path.join(projectRelative, 'package.json'), currentSha256: sha256(originalManifest), previousSha256: sha256(previousManifest), current: compilerVersions.current, previous: compilerVersions.previous },
      metadataNormalization: normalization.receipt, normalizedSides, axis, identities, nativeHelpers, roots, temporary,
    }
    await fs.writeFile(path.join(outDir, 'preparation.json'), `${JSON.stringify(preparation, null, 2)}\n`)
    await fs.writeFile(path.join(outDir, 'previous-webpack.patch'), patch)
    for (const root of Object.values(roots)) await command(root, 'pnpm', ['build:pkgs'])
    preparation.processes = processOwnership()
    await fs.writeFile(path.join(outDir, 'preparation.json'), `${JSON.stringify(preparation, null, 2)}\n`)
    return preparation
  }
  catch (error) {
    const cleanupErrors = []
    for (const [role, root] of Object.entries(roots)) {
      try {
        const evidenceDir = path.join(outDir, role)
        await fs.mkdir(evidenceDir, { recursive: true })
        for (const file of ['pnpm-lock.yaml', 'pnpm-workspace.yaml']) await fs.copyFile(path.join(root, file), path.join(evidenceDir, file))
        await fs.copyFile(path.join(root, projectRelative, 'package.json'), path.join(evidenceDir, 'target-package.json'))
      }
      catch (caught) { cleanupErrors.push(caught.stack ?? String(caught)) }
    }
    let retainedTemporary = true
    try { assertProcessesStopped(); await fs.rm(temporary, { recursive: true, force: true }); retainedTemporary = false }
    catch (caught) { cleanupErrors.push(caught.stack ?? String(caught)) }
    await fs.writeFile(path.join(outDir, 'preparation-error.json'), `${JSON.stringify({ temporary, roots, retainedTemporary, primaryError: failureEvidence(error), cleanupErrors, processes: processOwnership() }, null, 2)}\n`)
    throw error
  }
}
