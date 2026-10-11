import type { Document, Result as PostcssResult, Root } from '@weapp-tailwindcss/postcss'
import type { CompilerGenerateResult, CompilerSnapshot } from 'weapp-tailwindcss/core'
import type { TailwindV4ResolvedSource } from 'weapp-tailwindcss/generator'
import type { JsHandlerResult, UserDefinedOptions } from 'weapp-tailwindcss/types'
import { expectError, expectType } from 'tsd'
import { createCompiler, createContext } from 'weapp-tailwindcss/core'

const context = createContext({ appType: 'taro' })
expectType<Promise<Set<string>>>(context.getRuntimeSet())
expectType<Promise<PostcssResult<Root | Document>>>(context.transformWxss(''))
expectType<Promise<JsHandlerResult>>(context.transformJs('const foo = 1'))
expectType<Promise<string>>(context.transformWxml('<view class="foo"></view>'))

const customOptions: UserDefinedOptions = {
  appType: 'native',
  cssMatcher: name => name.endsWith('.wxss'),
}
const customContext = createContext(customOptions)
expectType<Promise<PostcssResult<Root | Document>>>(customContext.transformWxss(''))

const compiler = createCompiler({
  appType: 'taro',
  compiler: { maxRoots: 32 },
})
const source = {} as TailwindV4ResolvedSource
const generation = compiler.generate({
  candidates: ['p-4'],
  id: 'virtual:main.css',
  source,
  target: 'web',
})
expectType<Promise<CompilerGenerateResult>>(generation)
const snapshot = compiler.createSnapshot({
  classSet: ['p-4'],
  id: 'external-root',
  revision: 2,
  target: 'weapp',
})
expectType<CompilerSnapshot>(snapshot)
expectType<ReadonlySet<string>>(snapshot.classSet)
expectType<readonly string[]>(compiler.invalidate(['virtual:dependency']))
expectType<Promise<PostcssResult<Root | Document>>>(compiler.transformCss('', snapshot))
expectType<Promise<PostcssResult<Root>>>(compiler.transformCssRoot({} as Root, snapshot))
expectType<Promise<string>>(compiler.transformTemplate('<view />', snapshot))
expectType<Promise<JsHandlerResult>>(compiler.transformJavaScript('const value = 1', snapshot))
expectType<Promise<void>>(compiler.remove('external-root'))
expectType<Promise<void>>(compiler.dispose())
expectError(compiler.generate({
  id: 'invalid-source-request',
  source,
  sourceOptions: { css: '@tailwind utilities;' },
}))
