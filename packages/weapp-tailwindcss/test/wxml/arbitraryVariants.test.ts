import { MappingChars2String } from '@weapp-tailwindcss/escape'
import { getCompilerContext } from '@/context'

async function simpleHandler(str: string) {
  const { templateHandler } = getCompilerContext({
    customReplaceDictionary: MappingChars2String,
  })
  return templateHandler(str)
}

describe('arbitrary variants', () => {
  it('[&:nth-child(3)]:underline', async () => {
    const res = await simpleHandler('<li class="[&:nth-child(3)]:underline">{item}</li>')
    expect(res).toMatchSnapshot()
  })

  it('lg:[&:nth-child(3)]:hover:underline', async () => {
    const res = await simpleHandler('<li class="lg:[&:nth-child(3)]:hover:underline">{item}</li>')
    expect(res).toMatchSnapshot()
  })

  it('[&_p]:mt-4', async () => {
    const res = await simpleHandler('<div class="[&_p]:mt-4"></div>')
    expect(res).toMatchSnapshot()
  })

  it('[@supports(display:grid)]:grid', async () => {
    const res = await simpleHandler('<div class="flex [@supports(display:grid)]:grid"></div>')
    expect(res).toMatchSnapshot()
  })

  it('[@media(any-hover:hover){&:hover}]:opacity-100', async () => {
    const res = await simpleHandler('<button type="button" class="[@media(any-hover:hover){&:hover}]:opacity-100"></button>')
    expect(res).toMatchSnapshot()
  })

  it('[&_.u-count-down__text]:!text-red-400', async () => {
    const res = await simpleHandler('<view class="after:border-none after:content-[\'Hello_World\']">after:border-none</view>')
    expect(res).toMatchSnapshot()
  })
})

describe('simpleHandler', () => {
  it('[&:nth-child(3)]:underline', async () => {
    const res = await simpleHandler('<li class="[&:nth-child(3)]:underline">{item}</li>')
    expect(res).toMatchSnapshot()
  })

  it('lg:[&:nth-child(3)]:hover:underline', async () => {
    const res = await simpleHandler('<li class="lg:[&:nth-child(3)]:hover:underline">{item}</li>')
    expect(res).toMatchSnapshot()
  })

  it('[&_p]:mt-4', async () => {
    const res = await simpleHandler('<div class="[&_p]:mt-4"></div>')
    expect(res).toBe('<div class="_b_n_p_B_cmt-4"></div>')
  })

  it('[@supports(display:grid)]:grid', async () => {
    const res = await simpleHandler('<div class="flex [@supports(display:grid)]:grid"></div>')
    expect(res).toMatchSnapshot()
  })

  it('[@media(any-hover:hover){&:hover}]:opacity-100', async () => {
    const res = await simpleHandler('<button type="button" class="[@media(any-hover:hover){&:hover}]:opacity-100"></button>')
    expect(res).toMatchSnapshot()
  })

  it('[&_.u-count-down__text]:!text-red-400', async () => {
    const res = await simpleHandler('<view class="after:border-none after:content-[\'Hello_World\']">after:border-none</view>')
    expect(res).toBe('<view class="after_cborder-none after_ccontent-_b_aHello_World_a_B">after:border-none</view>')
  })
})
