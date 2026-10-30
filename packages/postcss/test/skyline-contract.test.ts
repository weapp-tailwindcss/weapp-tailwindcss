import postcss from 'postcss'
import { finalizeMiniProgramCss, finalizeMiniProgramCssRoot, pruneMiniProgramGeneratedCss } from '../src/compat/mini-program-css'
import { removeCssCoveredByRootStyleSources, removeScopedTailwindPreflightCss } from '../src/compat/scoped-css/cleanup'
import { removeCssRulesCoveredBySources } from '../src/compat/scoped-css/covered-rules'
import { createSkylineTypographyResetCss, isSkylineTypographyResetRule, SKYLINE_INVALID_RESET_PROPERTY } from '../src/compat/tailwindcss-v4/skyline-typography'
import { createStyleHandler } from '../src/handler'
import { dedupeMiniProgramPreflightSelectorRules } from '../src/compat/webpack-css/preflight'

const cssOptions = { skyline: true }
const options = { majorVersion: 4 as const, platform: 'mp-weixin', cssOptions }
const finalOptions = { isTailwindcssV4: true, cssPreflight: false as const, cssOptions }
const reset = createSkylineTypographyResetCss()

describe('Skyline 保留名称与组件初始化契约', () => {
  it('注册清理保留其他运行时变量的默认值需求', () => {
    const input = '@property --tw-shadow-alpha{syntax:"<percentage>";inherits:false;initial-value:100%}.x{line-height:var(--tw-leading,32px)}'
    const baseline = finalizeMiniProgramCss(input, { isTailwindcssV4: true, cssPreflight: false })
    const enabled = finalizeMiniProgramCss(input, finalOptions)
    const read = (css: string) => {
      const values: string[] = []
      postcss.parse(css).walkDecls('--tw-shadow-alpha', decl => { values.push(decl.value) })
      return values
    }
    expect(read(enabled)).toEqual(read(baseline))
    expect(read(enabled)).toEqual(['100%'])
  })
  it('局部资产先处理再 finalizer 不丢失非字体注册提供的默认值', async () => {
    const input = '@property --tw-shadow-alpha{syntax:"<percentage>";inherits:false;initial-value:100%}.x{line-height:var(--tw-leading,32px)}'
    const collect = async (skyline: boolean) => {
      const handled = await createStyleHandler({ ...options, isMainChunk: false, cssOptions: { skyline } })(input)
      const output = finalizeMiniProgramCss(handled.css, { ...finalOptions, cssOptions: { skyline } })
      const values: string[] = []
      postcss.parse(output).walkDecls('--tw-shadow-alpha', decl => { values.push(decl.value) })
      return values
    }
    expect(await collect(true)).toEqual(await collect(false))
    expect(await collect(true)).toEqual(['100%'])
  })
  it.each(['', '!important'])('Webpack 去重保留混合 reset 后面的 setter 顺序及优先级：%s', (important) => {
    const scope = 'view,text,::after,::before'
    const css = `${scope}{--tw-leading:var(--weapp-tw-invalid-reset);color:red}${scope}{--tw-leading:64px${important};--tw-font-weight:700}`
    expect(dedupeMiniProgramPreflightSelectorRules(css, { preserveSkylineTypography: true })).toBe(css)
    const conditional = `@supports(display:grid){${css}}`
    expect(dedupeMiniProgramPreflightSelectorRules(conditional, { preserveSkylineTypography: true })).toBe(conditional)
  })
  it.each([
    `view{${SKYLINE_INVALID_RESET_PROPERTY}:1px}`,
    String.raw`view{--weapp-tw-invalid-re\73 et:1px}`,
    `@supports(display:grid){view{${SKYLINE_INVALID_RESET_PROPERTY}:initial}}`,
    `@property ${SKYLINE_INVALID_RESET_PROPERTY}{syntax:"*";inherits:false}`,
    String.raw`@P\52 OPERTY --weapp-tw-invalid-reset{syntax:"*";inherits:false}`,
  ])('输入与 Root/string finalizer 在清理之前拒绝冲突：%s', async (input) => {
    await expect(async () => createStyleHandler(options)(input)).rejects.toMatchObject({ code: 'WEAPP_SKYLINE_TYPOGRAPHY' })
    expect(() => finalizeMiniProgramCss(input, finalOptions)).toThrow('保留变量')
    const root = postcss.parse(input)
    expect(() => finalizeMiniProgramCssRoot(root, finalOptions)).toThrow('保留变量')
    expect(root.toString()).toBe(input)
  })

  it('同一 handler 不因首个资产无冲突而漏掉后续无消费者资产', async () => {
    const handler = createStyleHandler(options)
    await handler('.x{line-height:var(--tw-leading,32px)}')
    await expect(async () => handler(`.unrelated{${SKYLINE_INVALID_RESET_PROPERTY}:1}`)).rejects.toThrow('保留变量')
  })

  it.each(['h5', 'web', 'app-plus', 'mp-alipay', 'mp-toutiao'])('排除目标不因保留名称或注册配置报错：%s', async (platform) => {
    const input = `.author{${SKYLINE_INVALID_RESET_PROPERTY}:1}`
    await expect(createStyleHandler({ ...options, platform, cssOptions: { skyline: true, cssRemoveProperty: false } })(input)).resolves.toBeDefined()
  })

  it('保留 @property 的显式配置立即报错', async () => {
    await expect(async () => createStyleHandler({ ...options, cssOptions: { skyline: true, atRules: { property: false } } })(reset)).rejects.toThrow('保留 @property')
    expect(() => finalizeMiniProgramCss(reset, { ...finalOptions, atRules: { property: false } })).toThrow('保留 @property')
  })

  it('初始化块不声明保留变量，按保留值识别任意初始化范围', () => {
    expect(reset).toContain(`var(${SKYLINE_INVALID_RESET_PROPERTY})`)
    postcss.parse(reset).walkDecls(SKYLINE_INVALID_RESET_PROPERTY, () => { throw new Error('不能声明内部变量') })
    const author = postcss.parse('.author{--tw-leading:var(--weapp-tw-invalid-reset);--tw-font-weight:var(--weapp-tw-invalid-reset)}').first
    expect(author?.type === 'rule' && isSkylineTypographyResetRule(author)).toBe(true)
  })

  it.each(['.reset', ':host', 'view,text'])('自定义 universal %s 的本地初始化不被 root coverage 删除', (selector) => {
    const local = createSkylineTypographyResetCss(selector)
    expect(removeCssCoveredByRootStyleSources(local, [local], undefined, { preserveSkylineTypography: true })).toBe(local)
    const conditional = `@media(min-width:1px){${local}}`
    expect(removeCssCoveredByRootStyleSources(conditional, [conditional], undefined, { preserveSkylineTypography: true })).toBe(conditional)
  })

  it('任意作者选择器的混合 reset 不删除其视觉声明', () => {
    const local = '.reset{padding:12px;--tw-leading:var(--weapp-tw-invalid-reset)}'
    expect(removeCssCoveredByRootStyleSources(local, [local], undefined, { preserveSkylineTypography: true })).toBe(local)
  })

  it('裁剪、finalizer 与关闭视觉 preflight 不会删除本地初始化', () => {
    const pruned = pruneMiniProgramGeneratedCss(reset, { cssOptions, preservePreflight: false })
    expect(pruned).toBe(reset)
    const finalized = finalizeMiniProgramCss(pruned, finalOptions)
    expect(finalized).toBe(reset)
    expect(finalizeMiniProgramCss(finalized, finalOptions)).toBe(finalized)
  })

  it('root 和 imported coverage 保留本地初始化，仍删除普通重复样式', () => {
    const css = `${reset}\n.item[data-v-abc]{color:red}`
    const root = `${reset}\n.item{color:red}`
    const keep = { preserveSkylineTypography: true }
    expect(removeCssCoveredByRootStyleSources(css, [root], undefined, keep)).toContain(reset)
    expect(removeScopedTailwindPreflightCss(css, keep)).toContain(reset)
    const filtered = removeCssRulesCoveredBySources(css, [root], { exactOnly: true, ...keep })
    expect(filtered).toContain(reset)
    expect(filtered).not.toContain('.item')
    expect(removeCssRulesCoveredBySources(css, [root], { exactOnly: true })).not.toContain('--tw-leading')
  })

  it.each([
    '--tw-leading:var(--weapp-tw-invalid-reset)',
    '--tw-font-weight:var(--weapp-tw-invalid-reset)',
    '--tw-leading:var(--weapp-tw-invalid-reset);border:0 solid',
    '--tw-leading:var(--weapp-tw-invalid-reset);--tw-tracking:initial',
  ])('按需默认值与合并的视觉规则保留 reset：%s', (declarations) => {
    const input = `view,text,::after,::before{${declarations}}`
    const finalized = finalizeMiniProgramCss(input, finalOptions)
    expect(finalized).toContain('var(--weapp-tw-invalid-reset)')
    expect(finalized).not.toContain('border:')
    const filtered = removeCssCoveredByRootStyleSources(input, [input], undefined, { preserveSkylineTypography: true })
    expect(filtered).toContain('var(--weapp-tw-invalid-reset)')
    expect(filtered).not.toContain('border:')
  })

  it('条件祖先与 scoped 选择器不会绕过 reset 保留', () => {
    const input = '@media(min-width:1px){view[data-v-abc],text.data-v-abc{--tw-leading:var(--weapp-tw-invalid-reset);color:red}}'
    const filtered = removeCssCoveredByRootStyleSources(input, [input], undefined, { preserveSkylineTypography: true })
    expect(filtered).toContain('@media')
    expect(filtered).toContain('var(--weapp-tw-invalid-reset)')
    expect(filtered).toContain('color:red')
  })

  it('混合规则的作者 setter、空值与声明顺序不会被视觉 preflight 清理误删', () => {
    const input = 'view,text,::after,::before{--tw-leading:initial;--tw-font-weight:700;--author:;color:red;border:0 solid}'
    const finalized = finalizeMiniProgramCss(input, finalOptions)
    expect(finalized).toContain('--tw-leading:var(--weapp-tw-invalid-reset);--tw-font-weight:700;--author:;color:red')
    expect(finalized).not.toContain('border:')
    const covered = removeCssCoveredByRootStyleSources(finalized, [finalized], undefined, { preserveSkylineTypography: true })
    expect(covered).toContain('--tw-font-weight:700;--author:;color:red')
  })
})
