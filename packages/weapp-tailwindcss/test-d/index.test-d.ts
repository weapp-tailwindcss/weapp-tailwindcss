import type { Transform } from 'node:stream'
import type { UserDefinedOptions } from 'weapp-tailwindcss/types'
import type { WeappTailwindcssVitePlugin } from 'weapp-tailwindcss/vite'
import { expectType } from 'tsd'
import {
  createPlugins,
  resolveMpxPlatformFromEnv,
  resolveTaroPlatformFromEnv,
  WeappTailwindcss,
} from 'weapp-tailwindcss'

const rootOptions: UserDefinedOptions = { appType: 'taro' }

expectType<boolean>(resolveTaroPlatformFromEnv({}).isWeb)
expectType<boolean>(resolveMpxPlatformFromEnv({}).isMp)

expectType<WeappTailwindcssVitePlugin[] | undefined>(WeappTailwindcss(rootOptions))

const rootGulpPlugins = createPlugins({ appType: 'native' })
expectType<Transform>(rootGulpPlugins.transformWxss())
expectType<Transform>(rootGulpPlugins.transformJs())
expectType<Transform>(rootGulpPlugins.transformWxml())
expectType<Promise<Set<string>>>(rootGulpPlugins.watchChange('src/tailwind.config.ts'))
