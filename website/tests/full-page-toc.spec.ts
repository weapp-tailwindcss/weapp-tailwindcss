import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { createCaptureBudget } from './helpers/full-page/capture'
import { prepareFullPageToc } from './helpers/full-page/screenshot'
import { observeToc } from './helpers/full-page/toc/observe'
import { TocReadinessError, waitForTocReadiness } from './helpers/full-page/toc/readiness'

test.use({ headless: true, viewport: { width: 1280, height: 720 } })
const options = { hideOnScroll: false, minHeadingLevel: 2, maxHeadingLevel: 3 }
const activeClass = 'table-of-contents__link--active'

async function fixture(page: Page, content: string, script = '') {
  await page.setContent(`<style>
    body{margin:0;height:1800px}.navbar{position:fixed;height:63px;top:0}
    .table-of-contents{position:fixed;top:80px;right:10px}.anchor{position:absolute;margin:0;height:30px}
    #first{top:267px}#second{top:600px}
    </style><nav class="navbar">navbar</nav>${content}<script>${script}</script>`)
}

const links = `<ul class="table-of-contents"><li><a class="table-of-contents__link toc-highlight" href="#first">first</a>
  <ul><li><a class="table-of-contents__link toc-highlight" href="#second">second</a></li></ul></li></ul>`
const headings = '<h2 class="anchor" id="first">first</h2><h3 class="anchor" id="second">second</h3>'

test('waits for the normal delayed effect without scroll, resize or viewport changes', async ({ page }) => {
  await fixture(page, links + headings, `window.events=[];
    for(const type of ['scroll','resize'])document.addEventListener(type,()=>window.events.push(type));
    setTimeout(()=>document.querySelector('[href="#first"]').classList.add('${activeClass}'),120)`)
  const before = await page.evaluate(() => [scrollX, scrollY, innerWidth, innerHeight])
  await waitForTocReadiness(page, createCaptureBudget(2000), options)
  await expect(page.locator('[href="#first"]')).toHaveClass(new RegExp(activeClass))
  expect(await page.evaluate(() => [scrollX, scrollY, innerWidth, innerHeight])).toEqual(before)
  expect(await page.evaluate(() => Reflect.get(window, 'events'))).toEqual([])
})

test('accepts no active link when the first heading is in the lower half', async ({ page }) => {
  await fixture(page, links + headings)
  await page.locator('#first').evaluate(node => (node as HTMLElement).style.top = '500px')
  await waitForTocReadiness(page, createCaptureBudget(1000), options)
  expect((await observeToc(page, options)).links.every(link => !link.active)).toBe(true)
})

test('uses every heading in the effective range, including an unlinked heading', async ({ page }) => {
  await fixture(page, `${links + headings}<h4 class="anchor" id="unlinked" style="top:200px">unlinked</h4>`)
  await page.locator('#first').evaluate(node => (node as HTMLElement).style.top = '-100px')
  await page.locator('#unlinked').evaluate(node => document.querySelector('#second')!.before(node))
  await waitForTocReadiness(page, createCaptureBudget(1000), { ...options, maxHeadingLevel: 4 })
  const observation = await observeToc(page, { ...options, maxHeadingLevel: 4 })
  expect(observation.headings.map(heading => heading.id)).toEqual(['first', 'unlinked', 'second'])
})

test('observes the next heading after a real caller scroll', async ({ page }) => {
  await fixture(page, links + headings)
  await page.evaluate(() => scrollTo(0, 400))
  await page.locator('[href="#second"]').evaluate((node, activeClass) => node.classList.add(activeClass), activeClass)
  const before = await page.evaluate(() => scrollY)
  await waitForTocReadiness(page, createCaptureBudget(1000), options)
  expect(await page.evaluate(() => scrollY)).toBe(before)
})

test('decodes hash targets in nested TOCs and uses the zero-height anchor parent rect', async ({ page }) => {
  await fixture(page, `<ul class="table-of-contents"><li><ul><li>
    <a class="table-of-contents__link toc-highlight ${activeClass}" href="#%E4%B8%AD%E6%96%87">中文</a>
    </li></ul></li></ul><section style="position:absolute;top:200px;height:40px">
    <h2 class="anchor" style="height:0" id="中文"></h2></section>`)
  await waitForTocReadiness(page, createCaptureBudget(1000), options)
  expect((await observeToc(page, options)).headings).toEqual([{ id: '中文', top: 200, bottom: 240 }])
})

test('hidden mobile TOC does not require targets, navbar or a policy', async ({ page }) => {
  await page.setContent('<div style="display:none"><a class="table-of-contents__link toc-highlight" href="#missing">hidden</a></div>')
  await waitForTocReadiness(page, createCaptureBudget(1000), null)
  expect((await observeToc(page, null)).links).toEqual([])
})

test('missing targets, unknown nodes and missing effective policy cannot pass', async ({ page }) => {
  for (const content of [
    '<a class="table-of-contents__link toc-highlight" href="#missing">missing</a>',
    '<div class="toc-highlight">unknown</div>',
    links + headings,
  ]) {
    await fixture(page, content)
    const policy = content === links + headings ? null : options
    await expect(waitForTocReadiness(page, createCaptureBudget(100), policy)).rejects.toBeInstanceOf(TocReadinessError)
  }
})

test('permanent mismatch retains its last observation attachment without repairing the DOM', async ({ page }, info) => {
  await fixture(page, links + headings)
  const before = await page.content()
  await expect(prepareFullPageToc(page, createCaptureBudget(120), options)).rejects.toThrow('TOC 未就绪')
  const attachment = info.attachments.find(item => item.name === 'full-page-toc-observation')
  expect(attachment?.contentType).toBe('application/json')
  const evidence = JSON.parse(attachment!.body!.toString())
  expect(evidence.readiness).toMatchObject({ ready: false, expected: 'first', actual: [] })
  expect(evidence.observation.headings[0]).toMatchObject({ id: 'first', top: 267, bottom: 297 })
  expect(await page.content()).toBe(before)
})

test('previous preparation and TOC share one deadline', async ({ page }) => {
  await fixture(page, links + headings)
  const budget = createCaptureBudget(1000)
  await budget.run(() => page.evaluate(() => new Promise<void>(resolve => setTimeout(resolve, 800))))
  const started = performance.now()
  await expect(waitForTocReadiness(page, budget, options)).rejects.toThrow('TOC 未就绪')
  expect(performance.now() - started).toBeLessThan(700)
  expect(() => budget.remaining()).toThrow('共享预算已耗尽')
})

test('metadata failures retain the last preliminary observation within the same budget', async ({ page }, info) => {
  await fixture(page, links + headings)
  const budget = createCaptureBudget(1000)
  await expect(prepareFullPageToc(page, budget, async () => {
    throw new Error('metadata missing marker')
  })).rejects.toThrow('TOC 未就绪')
  const attachment = info.attachments.find(item => item.name === 'full-page-toc-observation')
  const evidence = JSON.parse(attachment!.body!.toString())
  expect(evidence.failure).toBe('Error: metadata missing marker')
  expect(evidence.observation.links).toHaveLength(2)
  expect(evidence.readiness.ready).toBe(false)
  expect((await observeToc(page, options)).links.every(link => !link.active)).toBe(true)
})

test('hidden TOCs never load optional metadata', async ({ page }) => {
  await page.setContent('<div style="display:none"><a class="toc-highlight" href="#missing">hidden</a></div>')
  await prepareFullPageToc(page, createCaptureBudget(1000), async () => {
    throw new Error('hidden TOC must not load metadata')
  })
})
