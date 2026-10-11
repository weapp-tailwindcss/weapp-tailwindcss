import { isAllowedClassName } from '@weapp-tailwindcss/escape'

describe('json', () => {
  it('class allow', async () => {
    const res = await import('./fixtures/json/any.json')
    const a = []
    const b = []
    for (const x of res.default) {
      if (isAllowedClassName(x)) {
        a.push(x)
      }
      else {
        b.push(x)
      }
    }
    expect(a).toMatchSnapshot('Allowed')
    expect(b).toMatchSnapshot('Not Allowed')
  })
})
