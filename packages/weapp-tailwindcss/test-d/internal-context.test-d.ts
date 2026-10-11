import type { StyleHandler } from '@weapp-tailwindcss/postcss'
import type { CompilerHost } from 'weapp-tailwindcss/core'
import type { ICustomAttributesEntities, InternalUserDefinedOptions } from 'weapp-tailwindcss/types'
import { expectType } from 'tsd'

declare const context: InternalUserDefinedOptions

// 内部上下文必须保留处理器的 AST 能力与规范化后的属性匹配项。
expectType<StyleHandler>(context.styleHandler)
expectType<ICustomAttributesEntities>(context.customAttributesEntities)

// 对外 CompilerHost 表示构建图宿主，而不是同名的生命周期描述。
declare const host: CompilerHost
expectType<string | undefined | Promise<string | undefined>>(host.readSource('virtual:entry'))
