import type { pluginOptions } from 'postcss-preset-env'
import postcssPresetEnv from 'postcss-preset-env'

const omitted: pluginOptions = {}
const disabled: pluginOptions = { autoprefixer: false }
const configured: pluginOptions = { autoprefixer: { add: false } }

postcssPresetEnv(omitted)
postcssPresetEnv(disabled)
postcssPresetEnv(configured)
postcssPresetEnv({ autoprefixer: false })

// @ts-expect-error 仅补充文档明确支持的 false，不将公开选项契约扩大为 true。
postcssPresetEnv({ autoprefixer: true })
// @ts-expect-error 配置对象保留 autoprefixer 选项的实际类型。
postcssPresetEnv({ autoprefixer: { add: 'yes' } })
