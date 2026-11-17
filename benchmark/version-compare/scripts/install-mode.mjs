export function resolveInstallMode(role) {
  return role === 'current' ? '--frozen-lockfile' : '--no-frozen-lockfile'
}
