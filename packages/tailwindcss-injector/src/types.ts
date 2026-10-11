import type { postcss } from '@weapp-tailwindcss/postcss'
import type { Config } from 'tailwindcss'

export type InlineTailwindcssOptions = string | Partial<Config> | undefined

export interface Options {
  cwd: string
  filter: (input?: postcss.Input) => boolean
  config: InlineTailwindcssOptions | ((input?: postcss.Input) => InlineTailwindcssOptions)
  directiveParams: ('base' | 'components' | 'utilities' | 'variants')[]
  extensions: string[]
  insertAfterAtRulesNames: string[]
  insertAfterComments: (string | RegExp)[]
}
