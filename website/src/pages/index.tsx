import type { JSX, ReactNode } from 'react'
import Link from '@docusaurus/Link'
import useDocusaurusContext from '@docusaurus/useDocusaurusContext'
import LynxLogo from '@site/src/assets/framework-logos/lynx.svg'
import HarmonyOsLogo from '@site/src/assets/platform-logos/harmonyos.svg'
import MiniProgramLogo from '@site/src/assets/platform-logos/mini-program.svg'
import HomeLogo from '@site/src/components/HomeLogo'
import { useUiManagement } from '@site/src/features/ui-management/context'
import { useCurrentSiteLocale } from '@site/src/i18n/runtime'
import Layout from '@theme/Layout'
import HeroGithubBadge from '../components/HeroGithubBadge'
import HeroVersionBadge from '../components/HeroVersionBadge'
import { InteractionPill, PipelinePanel } from '../features/homepage/components'
import { ctaButton } from '../features/homepage/variants'

interface FactItem {
  label: string
  values: string[]
  icon: string
}

interface CapabilityItem {
  title: string
  description: string
  icon: string
}

interface EntryItem {
  href: string
  label: string
  description: string
  icon: string
}

interface PlatformIconItem {
  id: keyof typeof platformIconContent
  label: string
  href: string
}

const homepageCopy = {
  'zh-cn': {
    facts: [
      { label: 'Tailwind CSS', values: ['@source'], icon: 'icon-[mdi--tailwind]' },
      {
        label: '框架',
        values: ['uni-app', 'Taro', 'React Native', 'Lynx'],
        icon: 'icon-[mdi--transit-connection-variant]',
      },
      { label: '构建器', values: ['Webpack', 'Vite', 'Metro', 'Rspeedy'], icon: 'icon-[mdi--hammer-wrench]' },
      { label: '运行时', values: ['merge', 'cva', 'variants'], icon: 'icon-[mdi--function-variant]' },
    ] satisfies FactItem[],
    capabilities: [
      {
        title: '精确转译',
        description: 'JS 与模板只转换 Tailwind 已生成类名，避免业务字符串被误伤。',
        icon: 'icon-[mdi--target]',
      },
      {
        title: '多端输出目标',
        description: '按目标端生成 Web CSS、小程序 CSS 或原生样式清单。',
        icon: 'icon-[mdi--source-branch]',
      },
      {
        title: '跨生态落地',
        description: '覆盖 uni-app、Taro、Mpx、Weapp-vite、React Native、Lynx 与原生小程序。',
        icon: 'icon-[mdi--transit-connection-variant]',
      },
      {
        title: '运行时工具族',
        description: 'merge、variants、cva 在小程序端保持转义前后一致。',
        icon: 'icon-[mdi--package-variant-closed]',
      },
    ] satisfies CapabilityItem[],
    entries: [
      {
        href: '/docs/quick-start/install',
        label: '快速开始',
        description: '从 Tailwind CSS 4 与 CSS-first 入口开始。',
        icon: 'icon-[mdi--rocket-launch-outline]',
      },
      {
        href: '/docs/quick-start/frameworks/uni-app-vite',
        label: '框架接入',
        description: '按 uni-app、Taro、Mpx、Weapp-vite 或原生小程序选择配置。',
        icon: 'icon-[mdi--transit-connection-variant]',
      },
      {
        href: '/docs/api/interfaces/UserDefinedOptions',
        label: '配置项',
        description: '类型、插件与配置项的完整参考。',
        icon: 'icon-[mdi--api]',
      },
      {
        href: '/llms',
        label: 'AI / llms',
        description: '让模型读取精简索引，减少过期配置。',
        icon: 'icon-[logos--openai-icon]',
      },
      {
        href: '/docs/community/group',
        label: '社区',
        description: '加入交流群，反馈真实框架问题。',
        icon: 'icon-[mdi--account-group-outline]',
        control: 'communityEntry',
      },
    ] as Array<EntryItem & { control?: 'communityEntry' }>,
    platformIcons: [
      { id: 'web', label: 'Web', href: '/docs/intro' },
      { id: 'miniapp', label: '小程序', href: '/docs/quick-start/native/install' },
      { id: 'android', label: 'Android', href: '/docs/quick-start/frameworks/uni-app-x' },
      { id: 'ios', label: 'iOS', href: '/docs/quick-start/frameworks/uni-app-x' },
      { id: 'harmony', label: 'HarmonyOS', href: '/docs/quick-start/frameworks/uni-app-x' },
      { id: 'react-native', label: 'React Native', href: '/docs/quick-start/react-native-expo' },
      { id: 'lynx', label: 'Lynx', href: '/docs/quick-start/frameworks/lynx' },
    ] satisfies PlatformIconItem[],
    hero: {
      badge: 'Tailwind CSS 4 + 全端生成链路',
      copyrightAria: '查看版权与证书页面',
      copyrightTitle: 'G-Star 毕业项目认证',
      copyrightImageAlt: 'AtomGit G-Star 毕业项目认证徽章',
      lead: '一套原子化开发体验，交付 Web、小程序与原生跨端应用。',
      sublead: '按平台复用编译器、构建器集成与运行时适配，同时保留各端真实语义与工程边界。',
      platformAria: '支持平台',
      primaryCta: '开始接入',
      aiEntry: 'AI 学习入口',
      communityEntry: '加入技术交流群',
    },
    factsAria: '支持矩阵',
    capabilitiesTitle: '守住工程边界，接管生成与转译',
    capabilitiesSummary: '复用 Tailwind CSS 4 输入，把源码扫描、样式生成、类名转义和运行时工具放在一条工程链路里。',
    buildToolsTitle: '构建器接管 Tailwind 生成',
    buildToolsDescription: 'Webpack、Vite、Gulp 与自定义 Node 流程都由 weapp-tailwindcss 接管输出，小程序构建不再叠加官方 Tailwind 生成插件。',
    storyTitle: '同一套 Tailwind 输入，按目标端交付产物',
    storyBody: 'H5/Web 保持 Tailwind 原生语义；小程序补齐选择器、单位、转义与运行时边界。团队统一入口，再按框架接入。',
    storyCta: '查看配置项',
    entrypointsAria: '文档入口',
  },
  'en': {
    facts: [
      { label: 'Tailwind CSS', values: ['@source'], icon: 'icon-[mdi--tailwind]' },
      {
        label: 'Frameworks',
        values: ['uni-app', 'Taro', 'React Native', 'Lynx'],
        icon: 'icon-[mdi--transit-connection-variant]',
      },
      { label: 'Builders', values: ['Webpack', 'Vite', 'Metro', 'Rspeedy'], icon: 'icon-[mdi--hammer-wrench]' },
      { label: 'Runtime', values: ['merge', 'cva', 'variants'], icon: 'icon-[mdi--function-variant]' },
    ] satisfies FactItem[],
    capabilities: [
      {
        title: 'Precise transforms',
        description: 'Only class names that Tailwind already generated are transformed, so business strings stay untouched.',
        icon: 'icon-[mdi--target]',
      },
      {
        title: 'Multi-platform output targets',
        description: 'Generate Web CSS, mini-program CSS, or native style manifests for each target.',
        icon: 'icon-[mdi--source-branch]',
      },
      {
        title: 'Cross-ecosystem delivery',
        description: 'Supports uni-app, Taro, Mpx, Weapp-vite, React Native, Lynx, and native mini programs.',
        icon: 'icon-[mdi--transit-connection-variant]',
      },
      {
        title: 'Runtime utility family',
        description: 'merge, variants, and cva stay consistent around escaping on mini app targets.',
        icon: 'icon-[mdi--package-variant-closed]',
      },
    ] satisfies CapabilityItem[],
    entries: [
      {
        href: '/docs/quick-start/install',
        label: 'Quick Start',
        description: 'Start with Tailwind CSS 4 and the CSS-first entry.',
        icon: 'icon-[mdi--rocket-launch-outline]',
      },
      {
        href: '/docs/intro',
        label: 'Introduction',
        description: 'Learn how weapp-tailwindcss adapts Tailwind CSS for mini app runtimes.',
        icon: 'icon-[mdi--book-open-page-variant-outline]',
      },
      {
        href: '/blog',
        label: 'Release Notes',
        description: 'Follow English release notes and behavior changes.',
        icon: 'icon-[mdi--newspaper-variant-outline]',
      },
      {
        href: '/llms',
        label: 'AI / llms',
        description: 'Let models read a compact index and reduce stale setup advice.',
        icon: 'icon-[logos--openai-icon]',
      },
      {
        href: 'https://github.com/weapp-tailwindcss/weapp-tailwindcss/discussions',
        label: 'Community',
        description: 'Join GitHub Discussions and share framework-specific issues.',
        icon: 'icon-[mdi--account-group-outline]',
        control: 'communityEntry',
      },
    ] as Array<EntryItem & { control?: 'communityEntry' }>,
    platformIcons: [
      { id: 'web', label: 'Web', href: '/docs/intro' },
      { id: 'miniapp', label: 'Mini app', href: '/docs/quick-start/native/install' },
      { id: 'android', label: 'Android', href: '/docs/quick-start/frameworks/uni-app-x' },
      { id: 'ios', label: 'iOS', href: '/docs/quick-start/frameworks/uni-app-x' },
      { id: 'harmony', label: 'HarmonyOS', href: '/docs/quick-start/frameworks/uni-app-x' },
      { id: 'react-native', label: 'React Native', href: '/docs/quick-start/react-native-expo' },
      { id: 'lynx', label: 'Lynx', href: '/docs/quick-start/frameworks/lynx' },
    ] satisfies PlatformIconItem[],
    hero: {
      badge: 'Tailwind CSS 4 + cross-platform generation pipeline',
      copyrightAria: 'View the copyright and certificate page',
      copyrightTitle: 'G-Star graduation project certification',
      copyrightImageAlt: 'AtomGit G-Star graduation project badge',
      lead: 'One utility-first workflow for Web, mini programs, and native cross-platform apps.',
      sublead: 'Reuse compilers, builder integrations, and runtime adapters while preserving each platform\'s native semantics and engineering boundaries.',
      platformAria: 'Supported platforms',
      primaryCta: 'Start setup',
      aiEntry: 'AI entry',
      communityEntry: 'Join the tech community',
      communityHref: 'https://github.com/weapp-tailwindcss/weapp-tailwindcss/discussions',
    },
    factsAria: 'Support matrix',
    capabilitiesTitle: 'Keep firm engineering boundaries and own generation plus transforms',
    capabilitiesSummary: 'Reuse Tailwind CSS 4 input while keeping source scanning, style generation, class escaping, and runtime utilities in one engineering pipeline.',
    buildToolsTitle: 'Builders own Tailwind generation',
    buildToolsDescription: 'Webpack, Vite, Gulp, and custom Node flows all route output through weapp-tailwindcss so mini app builds do not stack the official Tailwind generation plugin.',
    storyTitle: 'One Tailwind input, delivered per runtime target',
    storyBody: 'H5/Web keeps native Tailwind semantics; mini apps add selectors, units, escaping, and runtime boundaries. Teams keep one entry and wire frameworks around it.',
    storyCta: 'Read the introduction',
    storyHref: '/docs/intro',
    entrypointsAria: 'Docs entry points',
  },
} as const

const platformIconContent: Record<string, ReactNode> = {
  'web': <i aria-hidden="true" className="icon-[logos--html-5] text-[29px]"></i>,
  'miniapp': <MiniProgramLogo aria-hidden="true" className="home-hero__platform-logo home-hero__platform-logo--mini-program" />,
  'android': <i aria-hidden="true" className="icon-[bi--android2] text-[30px] text-[#3DDC84]"></i>,
  'ios': <i aria-hidden="true" className="icon-[mdi--apple] text-[30px]"></i>,
  'harmony': <HarmonyOsLogo aria-hidden="true" className="home-hero__platform-logo home-hero__platform-logo--harmony" />,
  'react-native': <i aria-hidden="true" className="icon-[logos--react] text-[29px]"></i>,
  'lynx': <LynxLogo aria-hidden="true" className="home-hero__platform-logo home-hero__platform-logo--lynx" />,
}

function HomepageHeader() {
  const { homepage } = useUiManagement()
  const locale = useCurrentSiteLocale()
  const copy = homepageCopy[locale]
  const [tailwindFact, ...supportFacts] = copy.facts

  return (
    <main className="home-v5">
      <section className="home-hero">
        <div className="home-hero__content">
          {homepage.heroContent && (
            <div className="ui-homepage-hero-content home-hero__copy">
              <div className="home-hero__brand-row">
                <HomeLogo />
                {homepage.heroBadge && (
                  <span className="ui-homepage-hero-badge home-hero__badge">
                    {copy.hero.badge}
                  </span>
                )}
              </div>
              <div className="home-hero__title-wrap">
                {homepage.heroTitle && (
                  <h1 className="ui-homepage-hero-title home-hero__title">
                    <span className="home-hero__title-prefix">
                      <span>weapp</span>
                      <span className="from-weapp-to-tailwindcss">-</span>
                    </span>
                    <span className="home-hero__title-tail">tailwindcss</span>
                  </h1>
                )}
                {homepage.gstarBadge && (
                  <Link
                    aria-label={copy.hero.copyrightAria}
                    className="home-hero__gstar-corner ui-homepage-gstar-badge"
                    to="/copyright"
                    title={copy.hero.copyrightTitle}
                  >
                    <img
                      alt={copy.hero.copyrightImageAlt}
                      className="home-hero__gstar-corner-image"
                      loading="lazy"
                      src="/img/gstar-tag-twinkle.gif"
                    />
                  </Link>
                )}
              </div>
              {homepage.heroSubtitlePrimary && (
                <p className="ui-homepage-hero-subtitle-primary home-hero__lead">
                  {copy.hero.lead}
                </p>
              )}
              {homepage.heroSubtitleSecondary && (
                <p className="ui-homepage-hero-subtitle-secondary home-hero__sublead">
                  {copy.hero.sublead}
                </p>
              )}
              {homepage.platformTags && (
                <div className="home-hero__platform-strip" aria-label={copy.hero.platformAria}>
                  {copy.platformIcons.map(({ id, label, href }) => (
                    <Link aria-label={label} className="home-hero__platform-icon" key={id} title={label} to={href}>
                      {platformIconContent[id]}
                    </Link>
                  ))}
                </div>
              )}
              <div className="home-hero__actions">
                {homepage.primaryCta && (
                  <Link className={`${ctaButton()} home-cta ui-homepage-primary-cta`} to="/docs/quick-start/install">
                    <span>{copy.hero.primaryCta}</span>
                    <i aria-hidden="true" className="icon-[mdi--arrow-right] text-[1.1rem]"></i>
                  </Link>
                )}
                {homepage.aiEntry && (
                  <InteractionPill
                    className="ui-homepage-ai-entry"
                    href="/llms"
                    icon={<i aria-hidden="true" className="icon-[logos--openai-icon] text-[18px]"></i>}
                    label={copy.hero.aiEntry}
                  />
                )}
                {homepage.communityEntry && (
                  <InteractionPill
                    className="ui-homepage-community-entry"
                    href={'communityHref' in copy.hero ? copy.hero.communityHref : '/docs/community/group'}
                    icon={<i aria-hidden="true" className="icon-[mdi--account-group-outline] text-[18px]"></i>}
                    label={copy.hero.communityEntry}
                  />
                )}
              </div>
            </div>
          )}
          <PipelinePanel />
        </div>
      </section>

      {homepage.platformTags && (
        <section className="ui-homepage-platform-tags home-support" aria-label={copy.factsAria}>
          <div className="home-support__anchor">
            <div className="home-support__anchor-label">
              <i aria-hidden="true" className={tailwindFact.icon}></i>
              <span>{tailwindFact.label}</span>
            </div>
            <div className="home-support__anchor-values">
              {tailwindFact.values.map(value => (
                <strong key={value}>{value}</strong>
              ))}
            </div>
            {(homepage.githubBadge || homepage.npmVersionBadge) && (
              <div className="home-support__signals">
                {homepage.githubBadge && (
                  <HeroGithubBadge className="ui-homepage-github-badge" />
                )}
                {homepage.npmVersionBadge && (
                  <HeroVersionBadge className="ui-homepage-npm-version-badge" />
                )}
              </div>
            )}
          </div>
          <dl className="home-support__tracks">
            {supportFacts.map(fact => (
              <div className="home-support__track" key={fact.label}>
                <dt>
                  <i aria-hidden="true" className={fact.icon}></i>
                  <span>{fact.label}</span>
                </dt>
                <dd>
                  {fact.values.map(value => (
                    <strong key={value}>{value}</strong>
                  ))}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {homepage.heroFeatureGrid && (
        <section className="ui-homepage-hero-feature-grid home-capabilities" aria-labelledby="home-capabilities-title">
          <div className="home-section-heading">
            <h2 id="home-capabilities-title">{copy.capabilitiesTitle}</h2>
            <p>{copy.capabilitiesSummary}</p>
          </div>
          <div className="home-capabilities__layout">
            {homepage.buildToolsCard && (
              <article className="ui-homepage-build-tools-card home-capability home-capability--large">
                <i aria-hidden="true" className="icon-[mdi--webpack]"></i>
                <h3>{copy.buildToolsTitle}</h3>
                <p>{copy.buildToolsDescription}</p>
              </article>
            )}
            <div className="home-capabilities__grid">
              {copy.capabilities.map((item, index) => {
                const visible = index === 1
                  ? homepage.versionsCard
                  : index === 2
                    ? homepage.frameworksCard
                    : true
                if (!visible) {
                  return null
                }

                return (
                  <article className="home-capability" key={item.title}>
                    <i aria-hidden="true" className={item.icon}></i>
                    <h3>{item.title}</h3>
                    <p>{item.description}</p>
                  </article>
                )
              })}
            </div>
          </div>
        </section>
      )}

      <section className="home-v5-story" aria-labelledby="home-v5-title">
        <div>
          <h2 id="home-v5-title">{copy.storyTitle}</h2>
        </div>
        <div className="home-v5-story__body">
          <p>{copy.storyBody}</p>
          <Link to={'storyHref' in copy ? copy.storyHref : '/docs/api/interfaces/UserDefinedOptions'}>{copy.storyCta}</Link>
        </div>
      </section>

      <section className="home-entrypoints" aria-label={copy.entrypointsAria}>
        {copy.entries.map((entry) => {
          if (entry.control && !homepage[entry.control]) {
            return null
          }

          return (
            <Link
              className={['home-entrypoint', entry.control === 'communityEntry' ? 'ui-homepage-community-entry' : ''].filter(Boolean).join(' ')}
              to={entry.href}
              key={entry.href}
            >
              <i aria-hidden="true" className={entry.icon}></i>
              <span>
                <strong>{entry.label}</strong>
                <small>{entry.description}</small>
              </span>
            </Link>
          )
        })}
      </section>
    </main>
  )
}

export default function Home(): JSX.Element {
  const { siteConfig } = useDocusaurusContext()
  return (
    <Layout wrapperClassName="homepage" title={`${siteConfig.title} ${siteConfig.tagline}`} description={siteConfig.tagline}>
      <HomepageHeader />
    </Layout>
  )
}
