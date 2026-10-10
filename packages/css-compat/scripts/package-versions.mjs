import assert from 'node:assert/strict'

export function assertPackedPackageVersion(packed, source) {
  assert.equal(packed.name, source.name, 'tarball 必须属于当前源码包')
  assert.equal(packed.version, source.version, 'tarball 版本必须匹配当前源码 manifest')
}

export function assertPackedWorkspaceDependency(packed, source, dependency) {
  const specifier = source.dependencies?.[dependency.name]
  assert.ok(typeof specifier === 'string' && specifier.startsWith('workspace:'), '源码必须通过 workspace 协议消费兼容内核')
  const range = specifier.slice('workspace:'.length)
  const expected = range === '*' ? dependency.version : ['^', '~'].includes(range) ? `${range}${dependency.version}` : range
  assert.equal(packed.dependencies?.[dependency.name], expected, 'tarball 依赖必须匹配当前 workspace 发布版本')
}
