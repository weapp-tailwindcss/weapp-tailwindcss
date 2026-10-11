import type { PluginCreator } from '@weapp-tailwindcss/postcss'
import type { Options } from './types'
import { injectTailwindDirectives } from '@weapp-tailwindcss/postcss'
import { getConfig } from './config'
import { postcssPlugin } from './constants'
import { regExpTest } from './utils'
import { getDepFiles } from './wxml'

export type { Options }

const creator: PluginCreator<Partial<Options>> = (options) => {
  const { filter, directiveParams, insertAfterAtRulesNames, insertAfterComments } = getConfig(options)

  return {
    postcssPlugin,
    plugins: [
      {
        postcssPlugin: `${postcssPlugin}:post`,
        async Once(root, helpers) {
          const sourceInput = root.source?.input
          if (filter(sourceInput)) {
            injectTailwindDirectives(root, {
              directiveParams,
              insertAfterAtRulesNames,
              matchesComment: text => regExpTest(insertAfterComments, text),
            })

            if (sourceInput?.file) {
              const deps = await getDepFiles(sourceInput.file.replace(/\.[^.]+$/, '.wxml'))
              for (const dep of deps) {
                helpers.result.messages.push({
                  type: 'dependency',
                  plugin: postcssPlugin,
                  file: dep,
                })
              }
            }
          }
        },
      },
    ],
  }
}
creator.postcss = true

export default creator
