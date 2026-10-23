/** 框架身份只供兼容解析与组装使用，不进入编译配置或会话。 */
export const frameworkCatalog = {
  'generic': { aliases: [], family: undefined },
  'native': { aliases: [], family: undefined },
  'taro': { aliases: [], family: undefined },
  'uni-app': { aliases: ['uni-app-vite'], family: 'uni' },
  'uni-app-x': { aliases: [], family: 'uni' },
  'mpx': { aliases: [], family: undefined },
  'weapp-vite': { aliases: [], family: undefined },
} as const

export type FrameworkName = keyof typeof frameworkCatalog

/** 声明当前支持组合，兼容映射不能隐式扩大支持范围。 */
export const bundlerFrameworkNames = {
  vite: ['generic', 'taro', 'uni-app', 'uni-app-x', 'weapp-vite'],
  webpack: ['generic', 'mpx', 'taro', 'uni-app', 'weapp-vite'],
  gulp: ['native'],
} as const satisfies Record<string, readonly FrameworkName[]>

export type ViteFrameworkName = (typeof bundlerFrameworkNames.vite)[number]
export type WebpackFrameworkName = (typeof bundlerFrameworkNames.webpack)[number]
export type GulpFrameworkName = (typeof bundlerFrameworkNames.gulp)[number]

const aliases = new Map<string, FrameworkName>(Object.entries(frameworkCatalog)
  .flatMap(([name, entry]) => [name, ...entry.aliases].map(alias => [alias, name as FrameworkName])))

export function normalizeFrameworkName(value: string | undefined): FrameworkName | undefined {
  return value === undefined ? undefined : aliases.get(value)
}

export function isSupportedFramework<Bundler extends keyof typeof bundlerFrameworkNames>(
  bundler: Bundler,
  name: FrameworkName | undefined,
): name is (typeof bundlerFrameworkNames)[Bundler][number] {
  return name !== undefined && (bundlerFrameworkNames[bundler] as readonly string[]).includes(name)
}
