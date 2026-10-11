import { describe, expect, it } from 'vitest'
import { hasCssLocationDependencies as dependsOnLocation } from '../src/syntax/location-dependencies'

describe('CSS location dependency analysis', () => {
  it.each([
    '.a{background:url(./image.png)}',
    '.a{background:URL("../image.png")}',
    String.raw`.a{background:u\72l(./image.png)}`,
    String.raw`.a{background:\75rl("./image.png")}`,
    '@import "./other.css";',
    String.raw`@\69mport "./other.css";`,
    '.a{--image:url(./image.png)}',
    '.a{background:image-set(url(./one.png) 1x, url(/two.png) 2x)}',
    '.a{background:url("")}',
    '.a{background:url("/image.png" unknown-modifier)}',
    '.a{background:url("/unterminated)}',
    '.a{background:url(bad"url)}',
  ])('isolates relative or unknown resource syntax: %s', (css) => {
    expect(dependsOnLocation(css)).toBe(true)
  })

  it.each([
    '',
    '.a{color:red}',
    '.a{background:url(/image.png)}',
    '.a{background:url(//cdn.example/image.png)}',
    '.a{background:url(https://example.com/image.png)}',
    '.a{background:url(data:image/png;base64,AAAA)}',
    '.a{filter:url(#filter)}',
    String.raw`.a{background:u\72l("\2f image.png")}`,
    '.a{content:"url(./image.png)"}',
    '.a{content:"@import"}',
    '/* @import "./other.css"; url(./image.png) */ .a{}',
    '.a{background:url("https://example.com/a)b.png")}',
    '.a{background:url("/image.png" /* comment */)}',
  ])('shares location-independent source: %s', (css) => {
    expect(dependsOnLocation(css)).toBe(false)
  })
})
