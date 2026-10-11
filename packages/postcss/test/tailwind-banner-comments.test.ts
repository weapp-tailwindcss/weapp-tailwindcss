import postcss from 'postcss'
import { describe, expect, it } from 'vitest'
import { stripTailwindBannerComments } from '../src'

describe('stripTailwindBannerComments', () => {
  it('removes banner comments at every depth without changing other nodes or literals', () => {
    const source = `/*! tailwindcss v4.3.3 | MIT */
/*! Vendor | MIT */
/* tailwindcss v4.3.3 */
@media print {
  /*! TAILWINDCSS v3.4.0 */
  .card { /*!tailwindcss v4.3.3*/ content: "/*! tailwindcss v4.3.3 */"; color: red }
}`
    const root = postcss.parse(source)
    const originalDeclarations: postcss.Declaration[] = []
    root.walkDecls((decl) => {
      originalDeclarations.push(decl)
    })
    stripTailwindBannerComments(root)
    expect(root.toString()).toBe(`/*! Vendor | MIT */
/* tailwindcss v4.3.3 */
@media print {
  .card { content: "/*! tailwindcss v4.3.3 */"; color: red }
}`)
    const declarations: postcss.Declaration[] = []
    root.walkDecls((decl) => {
      declarations.push(decl)
    })
    expect(declarations).toHaveLength(originalDeclarations.length)
    declarations.forEach((decl, index) => {
      expect(decl).toBe(originalDeclarations[index])
    })
    const once = root.toString()
    stripTailwindBannerComments(root)
    expect(root.toString()).toBe(once)
  })

  it('handles a Document without reparsing or replacing its roots', () => {
    const first = postcss.parse('/*! tailwindcss v4.3.3 */.a{color:red}')
    const second = postcss.parse('/*! tailwindcss v4.3.3 */.b{color:blue}')
    const document = postcss.document({ nodes: [first, second] })
    stripTailwindBannerComments(document)
    expect(document.nodes).toEqual([first, second])
    expect(first.toString()).toBe('.a{color:red}')
    expect(second.toString()).toBe('.b{color:blue}')
  })

  it('leaves an empty root and unrelated comments untouched', () => {
    const root = postcss.root()
    stripTailwindBannerComments(root)
    expect(root.nodes).toEqual([])
    const source = '/*! tailwindcss plugin */ /* ! Vendor */ .a{color:red}'
    const other = postcss.parse(source)
    stripTailwindBannerComments(other)
    expect(other.toString()).toBe(source)
  })
})
