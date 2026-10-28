import path from 'node:path'

/** 隔离 npm 配置与认证，仅保留跨平台启动 pnpm 所需的环境。 */
export function installationEnvironment(env, directory) {
  const inherited = Object.fromEntries(Object.entries(env).filter(([name, value]) => typeof value === 'string'
    && /^(?:PATH|HOME|USERPROFILE|TMPDIR|TMP|TEMP|SYSTEMROOT|COMSPEC|PATHEXT)$/i.test(name)))
  return {
    ...inherited,
    CI: 'true',
    NO_COLOR: '1',
    COREPACK_ENABLE_AUTO_PIN: '0',
    COREPACK_ENABLE_NETWORK: '0',
    npm_config_registry: 'https://registry.npmjs.org/',
    npm_config_userconfig: path.join(directory, 'user.npmrc'),
    npm_config_globalconfig: path.join(directory, 'global.npmrc'),
  }
}
