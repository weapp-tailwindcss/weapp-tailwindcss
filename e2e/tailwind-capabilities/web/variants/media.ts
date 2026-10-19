import { attribute, variantElement, variantProbe } from './shared'

const breakpoints = [{ root: 'sm', width: 640 }, { root: 'md', width: 768 }, { root: 'lg', width: 1024 }, { root: 'xl', width: 1280 }, { root: '2xl', width: 1536 }]
const container = `<section id="container" style="container-type:inline-size;width:100px">${variantElement}</section>`

export const mediaVariantProbes = [
  ...breakpoints.map(({ root, width }) => variantProbe(`controlled-breakpoint-${root}`, root, [`variant/static/${root}`], [{ kind: 'viewport', before: { width: width - 1, height: 480 }, after: { width, height: 480 } }])),
  variantProbe('controlled-max', 'max-[700px]', ['variant/functional/max'], [{ kind: 'viewport', before: { width: 700, height: 480 }, after: { width: 699, height: 480 } }]),
  variantProbe('controlled-portrait', 'portrait', ['variant/static/portrait'], [{ kind: 'viewport', before: { width: 640, height: 480 }, after: { width: 480, height: 800 } }]),
  variantProbe('controlled-landscape', 'landscape', ['variant/static/landscape'], [{ kind: 'viewport', before: { width: 480, height: 800 }, after: { width: 640, height: 480 } }]),
  variantProbe('controlled-print', 'print', ['variant/static/print'], [{ kind: 'media', before: { media: 'screen' }, after: { media: 'print' } }]),
  variantProbe('controlled-motion-reduce', 'motion-reduce', ['variant/static/motion-reduce'], [{ kind: 'media', before: { reducedMotion: 'no-preference' }, after: { reducedMotion: 'reduce' } }]),
  variantProbe('controlled-motion-safe', 'motion-safe', ['variant/static/motion-safe'], [{ kind: 'media', before: { reducedMotion: 'reduce' }, after: { reducedMotion: 'no-preference' } }]),
  variantProbe('controlled-container-shorthand', '@[200px]', ['variant/functional/@'], [attribute('#container', 'style', 'container-type:inline-size;width:100px', 'container-type:inline-size;width:300px')], container),
  variantProbe('controlled-container-max', '@max-[200px]', ['variant/functional/@max'], [attribute('#container', 'style', 'container-type:inline-size;width:300px', 'container-type:inline-size;width:100px')], container),
]
