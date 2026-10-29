import type { ViteFrameworkTemplateAssetContext } from '@/bundlers/vite/shared/framework-asset-strategy'
import { createUniAppXAssetPipeline } from '@/bundlers/vite/frameworks/uni-app-x/asset-pipeline'

const reset = '.weapp-tw-border{border-width:0}'
const context = (css = reset): ViteFrameworkTemplateAssetContext => ({
  file: 'widgets/footer.axml',
  styles: [{ fileName: 'widgets/footer.acss', source: css }],
})

describe('issue 1319 compiled mini-program border preflight', () => {
  it('covers compiled HTML hosts with the reset from their own style asset', () => {
    const pipeline = createUniAppXAssetPipeline({ appType: 'uni-app-x', cssPreflight: { 'border-width': '0' } })
    const transform = pipeline.prepareTemplateAsset?.(context())
    const source = '<view class="mt-_b12px_B border-t-_b1px_B border-solid border-_bhe2e8f0_B"><label class="text-_b10px_B">配置文件提示</label></view>'
    expect(transform?.transform(source)).toBe(source.replace('class="mt-', 'class="weapp-tw-border mt-'))
  })

  it.each([
    ['<view/>', '<view class="weapp-tw-border"/>'],
    ['<view class/>', '<view class="weapp-tw-border"/>'],
    ['<view class=""/>', '<view class="weapp-tw-border"/>'],
    ["<text class='{{color}}'/>", "<text class='weapp-tw-border {{color}}'/>"],
    ['<view class=plain/>', '<view class="weapp-tw-border plain"/>'],
    ['<view class="{{[\'weapp-tw-border\', color]}}"/>', '<view class="{{[\'weapp-tw-border\', color]}}"/>'],
  ])('preserves static and dynamic class bindings: %s', (source, expected) => {
    const pipeline = createUniAppXAssetPipeline({ appType: 'uni-app-x', cssPreflight: { 'border-width': '0' } })
    const transform = pipeline.prepareTemplateAsset?.(context())
    expect(transform?.transform(source)).toBe(expected)
    expect(transform?.transform(expected)).toBe(expected)
  })

  it('keeps controls outside the default range and honors the explicit all range', () => {
    const source = '<block><view/><text/><button/><input/><label/><slot/><template/></block>'
    const run = (cssPreflightRange?: 'all') => createUniAppXAssetPipeline({ appType: 'uni-app-x', cssPreflight: { 'border-width': '0' }, cssPreflightRange })
      .prepareTemplateAsset?.(context())?.transform(source)
    expect(run()).toBe('<block><view class="weapp-tw-border"/><text class="weapp-tw-border"/><button/><input/><label/><slot/><template/></block>')
    expect(run('all')).toBe('<block><view class="weapp-tw-border"/><text class="weapp-tw-border"/><button class="weapp-tw-border"/><input class="weapp-tw-border"/><label class="weapp-tw-border"/><slot/><template/></block>')
  })

  it('requires its own configured border reset instead of unrelated CSS', () => {
    const prepare = (cssPreflight: false | Record<string, string | false> = { 'border-width': '0' }) => createUniAppXAssetPipeline({ appType: 'uni-app-x', cssPreflight }).prepareTemplateAsset
    expect(prepare(false)?.(context())).toBeUndefined()
    expect(prepare({ padding: '0' })?.(context())).toBeUndefined()
    expect(prepare()?.(context('.other{border-width:0}'))).toBeUndefined()
    expect(prepare()?.({ ...context(), styles: [] })).toBeUndefined()
    expect(prepare()?.({ ...context(), styles: [...context().styles, { fileName: 'widgets/footer.css', source: reset }] })).toBeUndefined()
    expect(prepare({ 'border-width': '2px' })?.(context('.weapp-tw-border{border-width:2px}'))).toBeDefined()
  })
  it.each(['wxs', 'sjs', 'filter'])('leaves %s scripts and declaration nodes unchanged', (tag) => {
    const pipeline = createUniAppXAssetPipeline({ appType: 'uni-app-x', cssPreflight: { 'border-width': '0' }, cssPreflightRange: 'all' })
    const source = `<${tag}>var marker = "<${tag}/><view/>";</${tag}><import src="./partial.wxml"/><include src="./partial.wxml"/><view/>`
    expect(pipeline.prepareTemplateAsset?.(context())?.transform(source)).toBe(source.replace(/<view\/>$/, '<view class="weapp-tw-border"/>'))
  })
})
