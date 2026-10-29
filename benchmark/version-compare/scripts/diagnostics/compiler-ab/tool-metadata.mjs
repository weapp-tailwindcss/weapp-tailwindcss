import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { isDeepStrictEqual } from 'node:util'
import { gunzipSync } from 'node:zlib'
import { list } from 'tar'
import semver from 'semver'

export const bunyanMetadata = Object.freeze({
  id: '@expo/bunyan@4.0.1', name: '@expo/bunyan', version: '4.0.1',
  integrity: 'sha512-+Lla7nYSiHZirgK+U/uYzsLv/X+HaJienbD5AKX1UQZHYfWaP+9uuQluRB4GrEVWF0GZ7vEVp/jzaOT9k/SQlg==',
  tarballSha256: '65133cf98ccf92ccff4dc4977d9247f7ccd33e35cdcfa86baba887f888306a79',
  tarballSha1: 'ab9e17e36c71c704a0ce72168378a487368da736',
  manifestSha256: 'ef4a038cd800147cbca27a77b8e54755934367dcde5532d329032ed506408fd2',
  packumentUrl: 'https://registry.npmjs.org/@expo%2fbunyan',
  versionUrl: 'https://registry.npmjs.org/@expo%2fbunyan/4.0.1',
  tarballUrl: 'https://registry.npmjs.org/@expo/bunyan/-/bunyan-4.0.1.tgz',
})

const engines = () => ({ node: '>=0.10.0' })
const digest = (value, algorithm = 'sha256', encoding = 'hex') => createHash(algorithm).update(value).digest(encoding)

/** 核对官方发布身份；旧 tarball 数组与 registry 对象的差异不扩展为一般 metadata 例外。 */
export function verifyBunyanSource({ version, packument, manifest, integrity, tarballSha256, tarballSha1, manifestSha256 }) {
  for (const value of [version, packument.versions?.[bunyanMetadata.version]]) {
    assert.equal(value?.name, bunyanMetadata.name, '官方 metadata 包名不符')
    assert.equal(value.version, bunyanMetadata.version, '官方 metadata 版本不符')
    assert.deepEqual(value.engines, engines(), '官方 registry engine 不符')
    assert.equal(value.dist?.integrity, bunyanMetadata.integrity, '官方 registry SRI 不符')
    assert.equal(value.dist.shasum, bunyanMetadata.tarballSha1, '官方 registry shasum 不符')
    assert.equal(value.dist.tarball, bunyanMetadata.tarballUrl, '官方 tarball URL 不符')
  }
  assert.equal(manifest.name, bunyanMetadata.name, '发布 tarball 包名不符')
  assert.equal(manifest.version, bunyanMetadata.version, '发布 tarball 版本不符')
  assert.deepEqual(manifest.engines, ['node >=0.10.0'], '发布 tarball engine 形态不符')
  assert.equal(integrity, bunyanMetadata.integrity, '发布 tarball SRI 不符')
  assert.equal(tarballSha256, bunyanMetadata.tarballSha256, '发布 tarball 内容不符')
  assert.equal(tarballSha1, bunyanMetadata.tarballSha1, '发布 tarball SHA1 不符')
  assert.equal(manifestSha256, bunyanMetadata.manifestSha256, '发布 manifest 内容不符')
  return { ...bunyanMetadata, registryEngines: engines(), tarballEngines: [...manifest.engines], verified: true }
}

async function download(url, filename, limit, deadline, request) {
  assert.ok(Date.now() < deadline, '官方 metadata 证据已超过总截止')
  const response = await request(url, { redirect: 'error', signal: AbortSignal.timeout(deadline - Date.now()) })
  assert.ok(response.ok, '官方 metadata 请求失败：' + response.status)
  assert.equal(response.url, url, '官方 metadata 响应 URL 不符')
  let size = 0
  const chunks = []
  for await (const chunk of response.body) {
    size += chunk.length
    assert.ok(size <= limit, '官方 metadata 证据超过上限')
    chunks.push(chunk)
  }
  const bytes = Buffer.concat(chunks)
  await fs.writeFile(filename, bytes, { flag: 'wx' })
  return bytes
}

/** 在当轮保存原始官方响应并以原锁 SRI 校验发布 tarball，不安装或加载上游实现。 */
export async function collectBunyanSource(directory, { request = fetch } = {}) {
  const deadline = Date.now() + 60000
  await fs.mkdir(directory)
  const files = {
    version: path.join(directory, 'version.json'),
    packument: path.join(directory, 'packument.json'),
    tarball: path.join(directory, 'bunyan-4.0.1.tgz'),
    manifest: path.join(directory, 'tarball-package.json'),
  }
  const version = await download(bunyanMetadata.versionUrl, files.version, 1024 * 1024, deadline, request)
  const packument = await download(bunyanMetadata.packumentUrl, files.packument, 2 * 1024 * 1024, deadline, request)
  const tarball = await download(bunyanMetadata.tarballUrl, files.tarball, 1024 * 1024, deadline, request)
  assert.equal(digest(tarball), bunyanMetadata.tarballSha256, '解析前必须确认准确发布 tarball')
  assert.equal('sha512-' + digest(tarball, 'sha512', 'base64'), bunyanMetadata.integrity)
  assert.ok(gunzipSync(tarball, { maxOutputLength: 256 * 1024 }).length <= 256 * 1024, '发布 tar 超过解压上限')
  let manifestBytes
  let matches = 0
  let unpacked = 0
  await list({ file: files.tarball, strict: true, onReadEntry(entry) {
    unpacked += entry.size
    assert.ok(unpacked <= 256 * 1024, '发布成员输出超过上限')
    if (entry.path !== 'package/package.json') { entry.resume(); return }
    assert.equal(entry.type, 'File', '发布 manifest 必须是普通文件')
    assert.ok(entry.size <= 65536, '发布 manifest 超过上限')
    matches += 1
    const chunks = []
    entry.on('data', chunk => chunks.push(chunk))
    entry.on('end', () => { manifestBytes = Buffer.concat(chunks) })
  } })
  assert.ok(Date.now() < deadline, '官方 metadata 证据已超过总截止')
  assert.equal(matches, 1, '发布 tarball 缺少唯一 manifest')
  await fs.writeFile(files.manifest, manifestBytes, { flag: 'wx' })
  const source = verifyBunyanSource({
    version: JSON.parse(version), packument: JSON.parse(packument), manifest: JSON.parse(manifestBytes),
    integrity: 'sha512-' + digest(tarball, 'sha512', 'base64'),
    tarballSha256: digest(tarball), tarballSha1: digest(tarball, 'sha1'), manifestSha256: digest(manifestBytes),
  })
  return { ...source, collectedAt: new Date().toISOString(), files: Object.fromEntries(Object.entries(files).map(([key, filename]) => [key, { filename, sha256: digest(key === 'version' ? version : key === 'packument' ? packument : key === 'tarball' ? tarball : manifestBytes) }])) }
}

/** 只为比较创建显式参考对象；原始锁字节及工具生成的派生锁均不改写。 */
export function bunyanMetadataReference(original, derived, source, nodeVersion = process.version) {
  assert.equal(source.verified, true, '缺少官方 metadata 身份证据')
  for (const key of Object.keys(bunyanMetadata)) assert.equal(source[key], bunyanMetadata[key], 'metadata 证据身份不符：' + key)
  assert.deepEqual(source.registryEngines, engines())
  assert.deepEqual(source.tarballEngines, ['node >=0.10.0'])
  assert.equal(nodeVersion, 'v22.23.4', 'metadata 兼容收据必须来自固定诊断 Node')
  assert.ok(semver.satisfies(nodeVersion, engines().node), '本轮 Node 不兼容官方 engine')
  const before = structuredClone(original.packages[bunyanMetadata.id])
  assert.deepEqual(before, { resolution: { integrity: bunyanMetadata.integrity } }, '原锁仅允许已归档的准确 bunyan metadata 遗漏')
  const reference = structuredClone(original)
  const after = { ...before, engines: engines() }
  const applied = !isDeepStrictEqual(derived.packages[bunyanMetadata.id], before)
  assert.deepEqual(derived.packages[bunyanMetadata.id], applied ? after : before, '工具只允许保留原条目或补齐准确 engine')
  reference.packages[bunyanMetadata.id] = applied ? after : before
  return {
    reference,
    receipt: { label: '准确发布包的对称工具 metadata 规范化', package: bunyanMetadata.id, applied, before, after: reference.packages[bunyanMetadata.id], source, runtime: { nodeVersion, actualProcessVersion: process.version, fixtureOverride: nodeVersion !== process.version, engine: engines().node, compatible: true }, referenceSha256: digest(JSON.stringify(reference)) },
  }
}

/** 两侧实际派生锁必须使用同一 metadata 参考，其它 metadata 与图仍由原严格审查覆盖。 */
export function auditBunyanMetadataSides(reference, sides) {
  for (const [role, lock] of Object.entries(sides)) assert.deepEqual(lock.packages[bunyanMetadata.id], reference.packages[bunyanMetadata.id], '派生锁未保持对称 metadata：' + role)
  return Object.keys(sides)
}
