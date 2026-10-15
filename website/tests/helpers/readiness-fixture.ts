import type { Page } from '@playwright/test'

export const fixtureUrl = 'http://website-readiness.test/'
export const analyticsUrls = [
  'https://www.google-analytics.com/g/collect?fixture=1',
  'https://www.google.com/g/collect?fixture=1',
]

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

export async function installReadinessFixture(page: Page, options: {
  reportingUrl?: string
  businessUrl?: string
  iframeUrl?: string
  iframeFetchUrl?: string
  reportingAsScript?: boolean
  redirect?: boolean
  status?: number
} = {}) {
  const css = deferred()
  const script = deferred()
  const reporting = deferred()
  const business = deferred()
  const iframe = deferred()
  const obsolete = deferred()
  const started = new Set<string>()
  const reportingUrl = options.reportingUrl ?? analyticsUrls[0]

  await page.route('**/*', async (route) => {
    const url = route.request().url()
    started.add(url)
    if (url === reportingUrl) {
      await reporting.promise
      await route.fulfill({ status: 204 })
    }
    else if (url === options.businessUrl) {
      await business.promise
      await route.fulfill({ body: 'business ready' })
    }
    else if (url === options.iframeUrl) {
      await iframe.promise
      await route.fulfill({ contentType: 'text/html', body: '<p>iframe ready</p>' })
    }
    else if (url === options.iframeFetchUrl) {
      await iframe.promise
      await route.fulfill({ status: 204 })
    }
    else if (url.endsWith('/frame')) {
      await route.fulfill({
        contentType: 'text/html',
        body: `<p>iframe ready</p><script>fetch(${JSON.stringify(options.iframeFetchUrl)}, { mode: 'no-cors' });</script>`,
      })
    }
    else if (url.endsWith('/style.css')) {
      await css.promise
      await route.fulfill({ contentType: 'text/css', body: 'button { color: rgb(12, 34, 56); }' })
    }
    else if (url.endsWith('/runtime.js')) {
      await script.promise
      await route.fulfill({
        contentType: 'application/javascript',
        body: `
          document.querySelector('button').onclick = () => {
            document.querySelector('output').textContent = 'clicked';
          };
          document.documentElement.dataset.hasHydrated = 'true';
        `,
      })
    }
    else if (url.endsWith('/obsolete')) {
      await obsolete.promise
      await route.fulfill({ body: 'old document resource' })
    }
    else if (options.redirect && url === fixtureUrl) {
      await route.fulfill({
        contentType: 'text/html',
        body: `<html><body><script>
          fetch('/obsolete');
          setTimeout(() => location.replace('/zh-cn/'), 20);
        </script></body></html>`,
      })
    }
    else {
      await route.fulfill({
        status: options.status ?? 200,
        contentType: 'text/html',
        body: `<!doctype html><html data-has-hydrated="false"><head>
          <script>
            ${options.reportingAsScript ? '' : `fetch(${JSON.stringify(reportingUrl)}, { mode: 'no-cors' });`}
            ${options.businessUrl ? `fetch(${JSON.stringify(options.businessUrl)}, { mode: 'no-cors' });` : ''}
          </script>
          ${options.reportingAsScript ? `<script async src="${reportingUrl}"></script>` : ''}
          <link rel="stylesheet" href="/style.css">
          <script defer src="/runtime.js"></script>
        </head><body><button>Click</button><output>waiting</output>
          ${options.iframeUrl ? `<iframe src="${options.iframeUrl}"></iframe>` : ''}
          ${options.iframeFetchUrl ? '<iframe src="/frame"></iframe>' : ''}
        </body></html>`,
      })
    }
  })

  return {
    started,
    releaseCss: css.resolve,
    releaseScript: script.resolve,
    releaseReporting: reporting.resolve,
    releaseBusiness: business.resolve,
    releaseIframe: iframe.resolve,
    async dispose() {
      for (const gate of [css, script, reporting, business, iframe, obsolete]) {
        gate.resolve()
      }
      await page.unrouteAll({ behavior: 'wait' })
    },
  }
}
