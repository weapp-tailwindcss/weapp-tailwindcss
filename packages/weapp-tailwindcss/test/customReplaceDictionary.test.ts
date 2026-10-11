import { MappingChars2String } from '@weapp-tailwindcss/escape'
import defu from 'defu'
import { getCompilerContext } from '@/context'

describe('customReplaceDictionary', () => {
  it('templateHandler custom map', async () => {
    const { templateHandler } = getCompilerContext({
      customAttributes: {
        'van-image': ['other-attr'],
      },
      customReplaceDictionary: defu(
        {
          '[': '-',
          ']': '-',
        },
        MappingChars2String,
      ),
    })
    const res = await templateHandler('<van-image class="w-[0.5px]" custom-class="w-[0.5px]" image-class="w-[0.5px]" other-attr="w-[0.5px]"></van-image>')
    expect(res).toMatchSnapshot()
  })

  it('templateHandler complex mode', async () => {
    const { templateHandler } = getCompilerContext({
      customAttributes: {
        'van-image': ['other-attr'],
      },
      customReplaceDictionary: MappingChars2String,
    })
    const res = await templateHandler('<van-image class="w-[0.5px]" custom-class="w-[0.5px]" image-class="w-[0.5px]" other-attr="w-[0.5px]"></van-image>')
    expect(res).toMatchSnapshot()
  })

  it('templateHandler default(complex) mode', async () => {
    const { templateHandler } = getCompilerContext({
      customAttributes: {
        'van-image': ['other-attr'],
      },
      customReplaceDictionary: MappingChars2String,
    })
    const res = await templateHandler('<van-image class="w-[0.5px]" custom-class="w-[0.5px]" image-class="w-[0.5px]" other-attr="w-[0.5px]"></van-image>')
    expect(res).toMatchSnapshot()
  })

  it('templateHandler simple mode', async () => {
    const { templateHandler } = getCompilerContext({
      customAttributes: {
        'van-image': ['other-attr'],
      },
    })
    const res = await templateHandler('<van-image class="w-[0.5px]" custom-class="w-[0.5px]" image-class="w-[0.5px]" other-attr="w-[0.5px]"></van-image>')
    expect(res).toBe('<van-image class="w-_b0_d5px_B" custom-class="w-[0.5px]" image-class="w-[0.5px]" other-attr="w-_b0_d5px_B"></van-image>')
  })

  it('styleHandler custom map', async () => {
    const { styleHandler } = getCompilerContext({
      customReplaceDictionary: defu(
        {
          '[': '-',
          ']': '-',
        },
        MappingChars2String,
      ),
    })
    const { css } = await styleHandler('.w-\\[0\\.5px\\]{--tw-border-opacity: 1;}', {
      isMainChunk: true,
    })
    expect(css).toMatchSnapshot()
  })

  it('styleHandler complex mode', async () => {
    const { styleHandler } = getCompilerContext({
      customReplaceDictionary: MappingChars2String,
    })
    const { css } = await styleHandler('.w-\\[0\\.5px\\]{--tw-border-opacity: 1;}', {
      isMainChunk: true,
    })
    expect(css).toMatchSnapshot()
  })

  it('styleHandler default(complex) mode', async () => {
    const { styleHandler } = getCompilerContext({
      customReplaceDictionary: MappingChars2String,
    })
    const { css } = await styleHandler('.w-\\[0\\.5px\\]{--tw-border-opacity: 1;}', {
      isMainChunk: true,
    })
    expect(css).toMatchSnapshot()
  })

  it('styleHandler simple mode', async () => {
    const { styleHandler } = getCompilerContext({})
    const { css } = await styleHandler('.w-\\[0\\.5px\\]{--tw-border-opacity: 1;}', {
      isMainChunk: true,
    })
    expect(css).toBe('.w-_b0_d5px_B{--tw-border-opacity: 1;}')
  })

  it('all prop with testClass', async () => {
    const { templateHandler } = getCompilerContext({
      customAttributes: {
        '*': ['testClass'],
      },
    })
    const res = await templateHandler('<van-image testClass="w-[0.5px]" class="w-[0.5px]" custom-class="w-[0.5px]" image-class="w-[0.5px]" other-attr="w-[0.5px]"></van-image>')
    expect(res).toBe('<van-image testClass="w-_b0_d5px_B" class="w-_b0_d5px_B" custom-class="w-[0.5px]" image-class="w-[0.5px]" other-attr="w-[0.5px]"></van-image>')
  })

  it('all prop with [Cc]lass', async () => {
    const { templateHandler } = getCompilerContext({
      customAttributes: {
        '*': [/[A-Za-z-]*[Cc]lass/],
      },
    })
    const res = await templateHandler('<van-image testClass="w-[0.5px]" class="w-[0.5px]" custom-class="w-[0.5px]" image-class="w-[0.5px]" other-attr="w-[0.5px]"></van-image>')
    expect(res).toBe('<van-image testClass="w-_b0_d5px_B" class="w-_b0_d5px_B" custom-class="w-_b0_d5px_B" image-class="w-_b0_d5px_B" other-attr="w-[0.5px]"></van-image>')
  })
})
