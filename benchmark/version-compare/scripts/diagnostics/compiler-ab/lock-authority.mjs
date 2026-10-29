import semver from 'semver'

/** manifest 的 provider 变化仅能传播至兼容的真实 peer；普通固定依赖不会因此获得改绑授权。 */
export function compilerBindingAuthority(lock, consumer, child, inherited, axis, name) {
  if (!inherited || name !== 'webpack') return false
  if (consumer === `<importer:${axis.projectRelative}>` || axis.parents.includes(consumer)) return true
  const peer = lock.packages[consumer]?.peerDependencies?.webpack
  return typeof peer === 'string' && semver.satisfies(child.id.slice('webpack@'.length), peer)
}
