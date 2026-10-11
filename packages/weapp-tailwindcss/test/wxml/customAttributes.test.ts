import { MappingChars2String } from '@weapp-tailwindcss/escape'
import { getCompilerContext } from '@/context'

describe('customAttributes', () => {
  it('van-image case 0', async () => {
    const { templateHandler } = getCompilerContext({
      customAttributes: {
        'van-image': ['image-class', 'loading-class', 'error-class'],
      },
      customReplaceDictionary: MappingChars2String,
    })
    const res = await templateHandler('<van-image class="w-[0.5px]" custom-class="w-[0.5px]" image-class="w-[0.5px]" other-attr="w-[0.5px]"></van-image>')
    expect(res).toMatchSnapshot()
  })

  it('van-image case 1', async () => {
    const { templateHandler } = getCompilerContext({
      customAttributes: {
        'van-image': ['other-attr'],
      },
      customReplaceDictionary: MappingChars2String,
    })
    const res = await templateHandler('<van-image class="w-[0.5px]" custom-class="w-[0.5px]" image-class="w-[0.5px]" other-attr="w-[0.5px]"></van-image>')
    expect(res).toMatchSnapshot()
  })

  it('view tag case', async () => {
    const { templateHandler } = getCompilerContext({
      customAttributes: {
        view: ['aa', 'bb'],
      },
      customReplaceDictionary: MappingChars2String,
    })
    const res = await templateHandler('<view class="w-[0.5px]" aa="w-[0.5px]" bb="w-[0.5px]" cc=="w-[0.5px]"></view>')
    expect(res).toMatchSnapshot()
  })

  it('wild card case', async () => {
    const { templateHandler } = getCompilerContext({
      customAttributes: {
        '*': ['aa', 'bb'],
      },
      customReplaceDictionary: MappingChars2String,
    })
    const res = await templateHandler('<view class="w-[0.5px]" aa="w-[0.5px]" bb="w-[0.5px]" cc=="w-[0.5px]"></view>')
    expect(res).toMatchSnapshot()
  })

  it('wild card case 0', async () => {
    const { templateHandler } = getCompilerContext({
      customAttributes: {
        '*': ['group-hover-class'],
      },
    })
    const res = await templateHandler('<view class="w-0.5 group" group-hover-class="!bg-indigo-500 !text-red"></view>')
    expect(res).toMatchSnapshot()
  })

  it('wild card via normal case', async () => {
    const { templateHandler } = getCompilerContext({
      customAttributes: {
        '*': ['aa', 'bb'],
        'cc': ['dd', 'ee'],
      },
      customReplaceDictionary: MappingChars2String,
    })
    const res = await templateHandler(
      '<view class="w-[0.5px]" aa="w-[0.5px]" bb="w-[0.5px]" dd="w-[0.5px]" ee="w-[0.5px]"></view><cc class="w-[0.5px]" aa="w-[0.5px]" bb="w-[0.5px]" dd="w-[0.5px]" ee="w-[0.5px]"></cc>',
    )
    expect(res).toMatchSnapshot()
  })

  it('map case', async () => {
    const map = new Map<string | RegExp, string | RegExp | (string | RegExp)[]>()
    map.set(/(?:van|el|ant)-\w+/g, ['custom-attrs', /shit/])
    const { templateHandler } = getCompilerContext({
      customAttributes: map,
      customReplaceDictionary: MappingChars2String,
    })
    const tags = ['van', 'el', 'ant']
    const res = await templateHandler(
      tags
        .map((x) => {
          return `<${x}-a class="w-[0.5px]" hover-class="w-[0.5px]" custom-attrs="w-[0.5px]" shit="w-[0.5px]" play-with-shit="w-[0.5px]"></${x}-a>`
        })
        .join('\n'),
    )
    expect(res).toMatchSnapshot()
  })

  it('simple map case', async () => {
    const map = new Map<string | RegExp, string | RegExp | (string | RegExp)[]>()
    map.set(/(?:van|el|ant)-\w+/, ['custom-attrs', /shit/])
    const { templateHandler } = getCompilerContext({
      customAttributes: map,
      customReplaceDictionary: MappingChars2String,
    })
    const tags = ['van']
    const res = await templateHandler(
      tags
        .map((x) => {
          return `<${x}-a class="w-[0.5px]" hover-class="w-[0.5px]" custom-attrs="w-[0.5px]" shit="w-[0.5px]" play-with-shit="w-[0.5px]"></${x}-a>`
        })
        .join('\n'),
    )
    expect(res).toMatchSnapshot()
  })
})
