import type { Config } from '@docusaurus/types'
import { homepageUiControls } from '../src/features/ui-management/homepage'
import { navbarUiControls, navbarUiStorageKey } from '../src/features/ui-management/navbar'
import { defaultSiteLocale, localePreferenceStorageKey } from '../src/i18n/locale'
import { getSiteConfigCopy } from '../src/i18n/siteConfig'
import { getBuildLocale } from './buildLocale'
import { organizationJsonLd, siteLanguage, siteName, siteUrl, softwareJsonLd, websiteJsonLd } from './siteMetadata'

const copy = getSiteConfigCopy(getBuildLocale())
const localeNavigationStorageKey = `${localePreferenceStorageKey}:navigation`

const navbarUiBootstrapScript = `
(() => {
  try {
    const rawValue = window.localStorage.getItem(${JSON.stringify(navbarUiStorageKey)});
    if (!rawValue) {
      return;
    }
    const parsed = JSON.parse(rawValue);
    const html = document.documentElement;
    const navbar = parsed && typeof parsed === 'object' && 'navbar' in parsed ? parsed.navbar : parsed;
    const homepage = parsed && typeof parsed === 'object' && 'homepage' in parsed ? parsed.homepage : null;
    ${navbarUiControls.map((control) => {
      const key = JSON.stringify(control.key)
      const attr = JSON.stringify(control.htmlAttribute)
      return `if (navbar && navbar[${key}] === false) { html.setAttribute(${attr}, 'hidden'); } else { html.removeAttribute(${attr}); }`
    }).join('\n    ')}
    ${homepageUiControls.map((control) => {
      const key = JSON.stringify(control.key)
      const attr = JSON.stringify(control.htmlAttribute)
      return `if (homepage && homepage[${key}] === false) { html.setAttribute(${attr}, 'hidden'); } else { html.removeAttribute(${attr}); }`
    }).join('\n    ')}
  } catch {}
})();
`.trim()

const localeBootstrapScript = `
(() => {
  try {
    const pathname = window.location.pathname;
    if (/^\\/en(?=\\/|$)/.test(pathname)) {
      let canonicalPathname = pathname;
      while (/^\\/en(?=\\/|$)/.test(canonicalPathname)) {
        canonicalPathname = canonicalPathname.replace(/^\\/en(?=\\/|$)/, '');
      }
      canonicalPathname = canonicalPathname || '/';
      window.location.replace(canonicalPathname + window.location.search + window.location.hash);
      return;
    }
    if (/^\\/zh-cn\\/zh-cn(?:\\/|$)/i.test(pathname)) {
      let canonicalPathname = pathname;
      while (/^\\/zh-cn\\/zh-cn(?:\\/|$)/i.test(canonicalPathname)) {
        canonicalPathname = canonicalPathname.replace(/^\\/zh-cn(?=\\/|$)/i, '');
      }
      window.location.replace(canonicalPathname + window.location.search + window.location.hash);
      return;
    }
    if (!(pathname === '/' || pathname === '/index.html')) {
      return;
    }
    const pendingLocale = window.sessionStorage.getItem(${JSON.stringify(localeNavigationStorageKey)});
    if (pendingLocale === 'en' || pendingLocale === 'zh-cn') {
      window.sessionStorage.removeItem(${JSON.stringify(localeNavigationStorageKey)});
      window.localStorage.setItem(${JSON.stringify(localePreferenceStorageKey)}, pendingLocale);
      if (pendingLocale === 'zh-cn') {
        window.location.replace('/zh-cn/' + (window.location.search || '') + (window.location.hash || ''));
        return;
      }
    }
    const rawStoredLocale = window.localStorage.getItem(${JSON.stringify(localePreferenceStorageKey)});
    const storedLocale = rawStoredLocale === 'en' || rawStoredLocale === 'zh-cn' ? rawStoredLocale : null;
    const navigatorLocales = Array.isArray(window.navigator.languages) && window.navigator.languages.length
      ? window.navigator.languages
      : [window.navigator.language];
    const hasChineseLocale = navigatorLocales.some(candidate =>
      typeof candidate === 'string' && candidate.toLowerCase().startsWith('zh'));
    const browserLocale = hasChineseLocale
      ? 'zh-cn'
      : ${JSON.stringify(defaultSiteLocale)};
    const targetLocale = storedLocale || browserLocale;
    if (targetLocale !== 'zh-cn') {
      return;
    }
    window.location.replace('/zh-cn/' + (window.location.search || '') + (window.location.hash || ''));
  } catch {}
})();
`.trim()

const localePreferenceScript = `
(() => {
  try {
    document.addEventListener('click', event => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      const link = target.closest('a[href]');
      if (!link) {
        return;
      }
      const url = new URL(link.href, window.location.href);
      if (url.origin !== window.location.origin) {
        return;
      }
      const language = link.getAttribute('lang');
      if (!language) {
        return;
      }
      const locale = language.toLowerCase().startsWith('en') ? 'en' : 'zh-cn';
      let pathname = window.location.pathname.replace(/\\/{2,}/g, '/');
      while (/^\\/zh-cn(?=\\/|$)/i.test(pathname)) {
        pathname = pathname.replace(/^\\/zh-cn(?=\\/|$)/i, '') || '/';
      }
      const targetPathname = locale === 'zh-cn'
        ? (pathname === '/' ? '/zh-cn/' : '/zh-cn' + pathname)
        : pathname;
      window.localStorage.setItem(${JSON.stringify(localePreferenceStorageKey)}, locale);
      window.sessionStorage.setItem(${JSON.stringify(localeNavigationStorageKey)}, locale);
      if (url.pathname !== targetPathname || window.location.pathname !== targetPathname) {
        event.preventDefault();
        window.location.assign(targetPathname + url.search + url.hash);
      }
    }, true);
  } catch {}
})();
`.trim()

const headTags: NonNullable<Config['headTags']> = [
  {
    tagName: 'script',
    // 为避免在本地/内网或被拦截时 window.gtag 未定义导致报错，这里注入一个兜底 stub。
    attributes: {
      type: 'text/javascript',
      id: 'gtag-stub',
    },
    innerHTML:
      'window.dataLayer = window.dataLayer || []; window.gtag = window.gtag || function(){ window.dataLayer.push(arguments); };',
  },
  {
    tagName: 'script',
    attributes: {
      type: 'text/javascript',
      id: 'ui-navbar-bootstrap',
    },
    innerHTML: navbarUiBootstrapScript,
  },
  {
    tagName: 'script',
    attributes: {
      type: 'text/javascript',
      id: 'locale-bootstrap',
    },
    innerHTML: localeBootstrapScript,
  },
  {
    tagName: 'script',
    attributes: {
      type: 'text/javascript',
      id: 'locale-preference-bootstrap',
    },
    innerHTML: localePreferenceScript,
  },
  {
    tagName: 'meta',
    attributes: {
      name: 'application-name',
      content: siteName,
    },
  },
  {
    tagName: 'meta',
    attributes: {
      httpEquiv: 'Content-Language',
      content: siteLanguage,
    },
  },
  {
    tagName: 'meta',
    attributes: {
      name: 'referrer',
      content: 'strict-origin-when-cross-origin',
    },
  },
  {
    tagName: 'meta',
    attributes: {
      name: 'distribution',
      content: 'global',
    },
  },
  {
    tagName: 'link',
    attributes: {
      rel: 'preconnect',
      href: 'https://hm.baidu.com',
    },
  },
  {
    tagName: 'link',
    attributes: {
      rel: 'alternate',
      type: 'application/rss+xml',
      title: copy.blog.feedTitle,
      href: `${siteUrl}/blog/rss.xml`,
    },
  },
  {
    tagName: 'link',
    attributes: {
      rel: 'sitemap',
      type: 'application/xml',
      href: `${siteUrl}/sitemap.xml`,
    },
  },
  {
    tagName: 'meta',
    attributes: {
      name: 'baidu-site-verification',
      content: 'codeva-4ny6UzMmrn',
    },
  },
  {
    tagName: 'script',
    attributes: {
      type: 'application/ld+json',
      id: 'organization-jsonld',
    },
    innerHTML: JSON.stringify(organizationJsonLd),
  },
  {
    tagName: 'script',
    attributes: {
      type: 'application/ld+json',
      id: 'website-jsonld',
    },
    innerHTML: JSON.stringify(websiteJsonLd),
  },
  {
    tagName: 'script',
    attributes: {
      type: 'application/ld+json',
      id: 'software-jsonld',
    },
    innerHTML: JSON.stringify(softwareJsonLd),
  },
]

export default headTags
