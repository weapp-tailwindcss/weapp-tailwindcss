import useDocusaurusContext from '@docusaurus/useDocusaurusContext'
import { getLocalePrefix, toLocalePath } from '@site/src/i18n/locale'
import { useCurrentSiteLocale } from '@site/src/i18n/runtime'
import Layout from '@theme/Layout'
import React from 'react'

const cardBase = `
  rounded-2xl border border-slate-200/60 bg-white/80
  p-5 shadow-[0_14px_40px_rgba(15,23,42,0.08)]
  backdrop-blur
  dark:border-white/10 dark:bg-slate-900/70 dark:shadow-[0_16px_50px_rgba(0,0,0,0.45)]
`

const TRAILING_SLASH_RE = /\/$/

const SKILL_INSTALL_COMMAND = `npx skills add sonofmagic/skills \\
  --skill weapp-tailwindcss \\
  --skill weapp-tailwindcss-setup \\
  --skill weapp-tailwindcss-migrate \\
  --skill weapp-tailwindcss-troubleshoot \\
  --skill weapp-tailwindcss-runtime \\
  --skill weapp-tailwindcss-custom-build \\
  --skill weapp-tailwindcss-react-native \\
  --skill weapp-tailwindcss-lynx \\
  -y`

const LOCAL_SKILL_INSTALL_COMMAND = SKILL_INSTALL_COMMAND.replace('sonofmagic/skills', '.')

const llmsPageCopy = {
  'zh-cn': {
    title: 'LLM / Skill 文档入口',
    description: '为大模型准备的 llms 文档入口与 weapp-tailwindcss skill 套件安装说明',
    badge: '🤖 AI 入口',
    intro: '构建后会生成一组便于大模型消费的文件：索引型 txt、全量 txt 以及去除 MDX import 的 Markdown 副本。本页同时包含 weapp-tailwindcss 官方 skill 套件安装指令，方便直接接入 AI 工作流。',
    quickstartCta: '直接查看 llms-quickstart.txt',
    fullCta: '获取全量 llms-full.txt',
    indexTitle: '可用索引文件',
    markdownTitle: 'Markdown 副本（示例）',
    markdownIntroPrefix: '每篇文档都会生成纯 Markdown（路径同原始 docs，只是后缀改为 .md）。完整列表见',
    skillTitle: 'Skill 套件安装与使用',
    skillIntro: '官方套件包含兼容协调入口，以及接入、迁移、排障、运行时、自定义构建、React Native 和 ReactLynx 七个专用工作流：',
    installCommandLabel: '安装完整套件',
    installCommand: SKILL_INSTALL_COMMAND,
    skillListLabel: '查看可安装 Skill 列表',
    localInstallLabel: '本地仓库调试安装',
    localInstallCommand: LOCAL_SKILL_INSTALL_COMMAND,
    promptTitle: '推荐提示词（新项目）',
    promptText: '使用 $weapp-tailwindcss-setup，为新的 uni-app Vue3 Vite 项目配置微信小程序和 H5，输出安装命令、完整配置文件和验证步骤。',
    docsEntryTitle: '文档入口',
    docsEntries: [
      { label: 'Skill（技能系统）文档', path: '/docs/ai/basics/skill' },
      { label: 'Skill 发布与版本化', path: '/docs/ai/basics/skill-release' },
    ],
    loadingTitle: '推荐加载顺序',
    onlineTitle: '在线模式',
    onlineSteps: [
      '产品问题先读取 {baseUrl}/llms-index.json；需要博客、AI 基础与历史内容时再读取 {baseUrl}/llms-index-full.json。',
      '入门、模板、AI 工作流：加载 {baseUrl}/llms-quickstart.txt。',
      '配置、API、兼容与迁移：加载 {baseUrl}/llms-api.txt。',
      '需要导航：先读取 {baseUrl}/llms.txt，拿到章节与链接。',
      '完整知识库：读取 {baseUrl}/llms-full.txt。',
    ],
    offlineTitle: '离线/批量模式',
    offlineSteps: [
      '下载 llms-full.txt 或构建产出的 Markdown 文件整体打包。',
      '向量化时可按章节拆分，使用 llms.txt 里的标题做元信息。',
      '使用 llms-index.json 作为产品首层索引，llms-index-full.json 作为完整知识库索引。',
      '生成回答时引用具体链接或标题，便于追溯来源。',
    ],
    exampleTitle: '示例提示词',
    examplePrompt: '你可以从 {baseUrl}/llms-quickstart.txt 和 {baseUrl}/llms-api.txt 读取 weapp-tailwindcss 的入门、配置和常见问题，回答时请引用对应链接。',
    txtFiles: [
      { label: 'llms-index.json', path: '/llms-index.json', desc: 'GEO 索引（标题、摘要、关键词、canonical）' },
      { label: 'llms-index-full.json', path: '/llms-index-full.json', desc: '包含博客、AI 基础与历史内容的完整 GEO 索引' },
      { label: 'llms.txt', path: '/llms.txt', desc: '全站文档链接索引（llmstxt.org 规范）' },
      { label: 'llms-full.txt', path: '/llms-full.txt', desc: '全量内容（适合离线/一次性载入）' },
      { label: 'llms-quickstart.txt', path: '/llms-quickstart.txt', desc: '入门、模板、AI 工作流合集' },
      { label: 'llms-api.txt', path: '/llms-api.txt', desc: '配置、API、迁移与常见问题' },
    ],
    markdownExamples: [
      { label: 'intro.md', path: '/intro.md', desc: '文档首页内容副本' },
      { label: 'quick-start/install.md', path: '/quick-start/install.md', desc: 'Tailwind CSS 4 生成模式安装指南' },
      { label: 'tailwindcss/v4-reference.md', path: '/tailwindcss/v4-reference.md', desc: 'Tailwind CSS 4 默认模式参考' },
      { label: 'tools/weapp-tw-cli.md', path: '/tools/weapp-tw-cli.md', desc: 'CLI 用法' },
      { label: 'ai/index.md', path: '/ai/index.md', desc: 'AI 生成小程序专题' },
    ],
  },
  'en': {
    title: 'LLM / Skill entry',
    description: 'LLMS entry points and weapp-tailwindcss skill suite install notes for AI workflows',
    badge: '🤖 AI entry',
    intro: 'After build, the site emits model-friendly assets: index txt files, full-content txt bundles, and Markdown copies with MDX imports stripped out. This page also includes the complete weapp-tailwindcss skill suite install flow.',
    quickstartCta: 'Open llms-quickstart.txt',
    fullCta: 'Fetch llms-full.txt',
    indexTitle: 'Available index files',
    markdownTitle: 'Markdown copies (examples)',
    markdownIntroPrefix: 'Each doc also ships as plain Markdown with the same route path and a .md suffix. For the full list, see',
    skillTitle: 'Install and use the skill suite',
    skillIntro: 'The suite includes the compatibility router plus seven focused setup, migration, troubleshooting, runtime, custom-build, React Native, and ReactLynx workflows:',
    installCommandLabel: 'Install the complete suite',
    installCommand: SKILL_INSTALL_COMMAND,
    skillListLabel: 'List installable skills',
    localInstallLabel: 'Install from the local repo for debugging',
    localInstallCommand: LOCAL_SKILL_INSTALL_COMMAND,
    promptTitle: 'Suggested prompt (new project)',
    promptText: 'Use $weapp-tailwindcss-setup to configure a new uni-app Vue 3 + Vite project for WeChat mini apps and H5, including complete files and verification steps.',
    docsEntryTitle: 'Docs entry points',
    docsEntries: [
      { label: 'Introduction', path: '/docs/intro' },
      { label: 'Install dependencies', path: '/docs/quick-start/install' },
    ],
    loadingTitle: 'Recommended loading order',
    onlineTitle: 'Online mode',
    onlineSteps: [
      'Read {baseUrl}/llms-index.json for product questions, then use {baseUrl}/llms-index-full.json only when blog, AI fundamentals, or historical context is needed.',
      'Quick start and setup context: load {baseUrl}/llms-quickstart.txt.',
      'Need navigation context: read {baseUrl}/llms.txt first to get section names and links.',
      'Full knowledge base: read {baseUrl}/llms-full.txt.',
    ],
    offlineTitle: 'Offline / batch mode',
    offlineSteps: [
      'Download llms-full.txt or package the generated Markdown files together.',
      'When vectorizing, split by section and use titles from llms.txt as metadata.',
      'Use llms-index.json as the product index and llms-index-full.json as the complete knowledge-base index.',
      'When generating answers, cite the exact link or title so the source stays traceable.',
    ],
    exampleTitle: 'Example prompt',
    examplePrompt: 'You can read the English weapp-tailwindcss introduction and install guide from {baseUrl}/llms-quickstart.txt. Please cite the corresponding links in your answer.',
    txtFiles: [
      { label: 'llms-index.json', path: '/llms-index.json', desc: 'GEO index with titles, summaries, keywords, and canonicals' },
      { label: 'llms-index-full.json', path: '/llms-index-full.json', desc: 'Complete GEO index including blog, AI fundamentals, and history' },
      { label: 'llms.txt', path: '/llms.txt', desc: 'Site-wide document link index following llmstxt.org' },
      { label: 'llms-full.txt', path: '/llms-full.txt', desc: 'Full content bundle for offline or single-pass loading' },
      { label: 'llms-quickstart.txt', path: '/llms-quickstart.txt', desc: 'English introduction and installation guidance' },
    ],
    markdownExamples: [
      { label: 'intro.md', path: '/intro.md', desc: 'Copy of the docs homepage content' },
      { label: 'quick-start/install.md', path: '/quick-start/install.md', desc: 'Tailwind CSS 4 generation-mode install guide' },
    ],
  },
} as const

function useBaseUrl() {
  const { siteConfig } = useDocusaurusContext()
  const browserOrigin = typeof window !== 'undefined' ? window.location.origin : ''
  const siteUrl = (siteConfig?.url || browserOrigin || '').replace(TRAILING_SLASH_RE, '')
  const base = (siteConfig?.baseUrl || '/').replace(TRAILING_SLASH_RE, '')
  return `${siteUrl}${base === '/' ? '' : base}`
}

function formatTemplate(template: string, baseUrl: string) {
  return template.replaceAll('{baseUrl}', baseUrl)
}

export default function LLMSPage() {
  const locale = useCurrentSiteLocale()
  const copy = llmsPageCopy[locale]
  const baseUrl = useBaseUrl()
  const localePrefix = getLocalePrefix(locale)

  return (
    <Layout title={copy.title} description={copy.description}>
      <main className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0">
          <div className={`
            absolute left-[-10%] top-[-10%] size-[520px] rounded-full
            bg-sky-400/10 blur-3xl
          `}
          />
          <div className={`
            absolute right-[-12%] top-[5%] size-[480px] rounded-full
            bg-emerald-400/10 blur-3xl
          `}
          />
          <div className={`
            absolute bottom-[-25%] left-[20%] size-[540px] rounded-full
            bg-indigo-400/10 blur-3xl
          `}
          />
        </div>
        <div className="container relative z-[1] flex flex-col gap-8 py-12">
          <header
            className={`
              ${cardBase}
              flex flex-col gap-3 border-slate-200/70
            `}
          >
            <span className={`
              inline-flex w-fit items-center gap-2 rounded-full bg-sky-100 px-3
              py-1 text-xs font-semibold text-sky-700
              dark:bg-sky-900/40 dark:text-sky-200
            `}
            >
              {copy.badge}
            </span>
            <h1 className={`
              text-3xl font-bold
              md:text-4xl
            `}
            >
              {copy.title}
            </h1>
            <p className={`
              max-w-4xl text-slate-600
              dark:text-slate-200/80
            `}
            >
              {copy.intro}
            </p>
            <div className="flex flex-wrap gap-3">
              <a
                className={`
                  inline-flex items-center gap-2 rounded-full bg-slate-900 px-4
                  py-2 text-sm font-semibold text-white shadow-lg
                  shadow-sky-500/25 transition
                  hover:-translate-y-0.5 hover:bg-slate-800
                  dark:bg-white dark:text-slate-900
                  dark:hover:bg-slate-100
                `}
                href={`${baseUrl}${localePrefix}/llms-quickstart.txt`}
                target="_blank"
                rel="noreferrer"
              >
                {copy.quickstartCta}
                <span aria-hidden className="text-lg">↗</span>
              </a>
              <a
                className={`
                  inline-flex items-center gap-2 rounded-full border
                  border-slate-300/70 bg-white px-4 py-2 text-sm font-semibold
                  text-slate-800 shadow-sm transition
                  hover:-translate-y-0.5 hover:border-slate-400
                  dark:border-white/15 dark:bg-slate-900 dark:text-white
                  dark:hover:border-white/30
                `}
                href={`${baseUrl}${localePrefix}/llms-full.txt`}
                target="_blank"
                rel="noreferrer"
              >
                {copy.fullCta}
                <span aria-hidden className="text-lg">↗</span>
              </a>
            </div>
          </header>

          <section className={`
            grid gap-6
            md:grid-cols-2
          `}
          >
            <div className={cardBase}>
              <h2 className="mb-3 text-xl font-semibold">{copy.indexTitle}</h2>
              <ul className="space-y-2">
                {copy.txtFiles.map(item => (
                  <li
                    className={`
                      flex items-start gap-2 rounded-xl bg-slate-50/80 px-3 py-2
                      text-sm text-slate-700
                      dark:bg-white/5 dark:text-slate-200
                    `}
                    key={item.label}
                  >
                    <span className="mt-0.5 text-base">📄</span>
                    <div className="flex flex-col gap-0.5">
                      <a
                        className={`
                          font-semibold text-sky-600
                          hover:text-sky-500
                          dark:text-sky-300
                          dark:hover:text-sky-200
                        `}
                        href={`${baseUrl}${localePrefix}${item.path}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {item.label}
                      </a>
                      <span className={`
                        text-xs text-slate-500
                        dark:text-slate-400
                      `}
                      >
                        {item.desc}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            <div className={cardBase}>
              <h2 className="mb-3 text-xl font-semibold">{copy.markdownTitle}</h2>
              <p className={`
                text-sm text-slate-600
                dark:text-slate-300
              `}
              >
                {copy.markdownIntroPrefix}
                {' '}
                <a
                  className={`
                    font-semibold text-sky-600
                    hover:text-sky-500
                    dark:text-sky-300
                    dark:hover:text-sky-200
                  `}
                  href={`${baseUrl}${localePrefix}/llms.txt`}
                  target="_blank"
                  rel="noreferrer"
                >
                  llms.txt
                </a>
                {locale === 'en' ? '.' : '。'}
              </p>
              <ul className="mt-3 space-y-2">
                {copy.markdownExamples.map(item => (
                  <li
                    className={`
                      flex items-start gap-2 rounded-xl bg-slate-50/80 px-3 py-2
                      text-sm text-slate-700
                      dark:bg-white/5 dark:text-slate-200
                    `}
                    key={item.label}
                  >
                    <span className="mt-0.5 text-base">📘</span>
                    <div className="flex flex-col gap-0.5">
                      <a
                        className={`
                          font-semibold text-sky-600
                          hover:text-sky-500
                          dark:text-sky-300
                          dark:hover:text-sky-200
                        `}
                        href={`${baseUrl}${localePrefix}${item.path}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {item.label}
                      </a>
                      <span className={`
                        text-xs text-slate-500
                        dark:text-slate-400
                      `}
                      >
                        {item.desc}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          <section className={cardBase}>
            <h2 className="mb-3 text-xl font-semibold">{copy.skillTitle}</h2>
            <p className={`
              text-sm text-slate-600
              dark:text-slate-300
            `}
            >
              {copy.skillIntro}
            </p>
            <div className={`
              mt-3 rounded-xl border border-dashed border-slate-300/70
              bg-slate-50/70 p-3 text-sm text-slate-700
              dark:border-white/15 dark:bg-white/5 dark:text-slate-200
            `}
            >
              <p className="font-semibold">{copy.installCommandLabel}</p>
              <code className={`
                mt-2 block whitespace-pre-wrap rounded-lg bg-black/90 px-3 py-3
                text-xs text-emerald-200 shadow-[0_8px_30px_rgba(0,0,0,0.35)]
              `}
              >
                {copy.installCommand}
              </code>
              <p className="mt-3 font-semibold">{copy.skillListLabel}</p>
              <code className={`
                mt-2 block whitespace-pre-wrap rounded-lg bg-black/90 px-3 py-3
                text-xs text-emerald-200 shadow-[0_8px_30px_rgba(0,0,0,0.35)]
              `}
              >
                npx skills add sonofmagic/skills --list
              </code>
              <p className="mt-3 font-semibold">{copy.localInstallLabel}</p>
              <code className={`
                mt-2 block whitespace-pre-wrap rounded-lg bg-black/90 px-3 py-3
                text-xs text-emerald-200 shadow-[0_8px_30px_rgba(0,0,0,0.35)]
              `}
              >
                {copy.localInstallCommand}
              </code>
            </div>

            <div className={`
              mt-4 grid gap-3
              md:grid-cols-2
            `}
            >
              <div className={`
                rounded-xl bg-slate-50/80 px-3 py-3 text-sm text-slate-700
                dark:bg-white/5 dark:text-slate-200
              `}
              >
                <p className="font-semibold">{copy.promptTitle}</p>
                <code className={`
                  mt-2 block whitespace-pre-wrap rounded-lg bg-black/90 px-3
                  py-3 text-xs text-emerald-200
                  shadow-[0_8px_30px_rgba(0,0,0,0.35)]
                `}
                >
                  {copy.promptText}
                </code>
              </div>
              <div className={`
                rounded-xl bg-slate-50/80 px-3 py-3 text-sm text-slate-700
                dark:bg-white/5 dark:text-slate-200
              `}
              >
                <p className="font-semibold">{copy.docsEntryTitle}</p>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  {copy.docsEntries.map(item => (
                    <li key={item.path}>
                      <a
                        className={`
                          font-semibold text-sky-600
                          hover:text-sky-500
                          dark:text-sky-300
                          dark:hover:text-sky-200
                        `}
                        href={`${baseUrl}${toLocalePath(item.path, locale)}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {item.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </section>

          <section className={cardBase}>
            <h2 className="mb-3 text-xl font-semibold">{copy.loadingTitle}</h2>
            <div className={`
              grid gap-4
              md:grid-cols-2
            `}
            >
              <div className={`
                space-y-2 text-sm text-slate-700
                dark:text-slate-200
              `}
              >
                <p className="font-semibold">{copy.onlineTitle}</p>
                <ol className="list-decimal space-y-1 pl-5">
                  {copy.onlineSteps.map(step => (
                    <li key={step}>{formatTemplate(step, baseUrl)}</li>
                  ))}
                </ol>
              </div>
              <div className={`
                space-y-2 text-sm text-slate-700
                dark:text-slate-200
              `}
              >
                <p className="font-semibold">{copy.offlineTitle}</p>
                <ul className="list-disc space-y-1 pl-5">
                  {copy.offlineSteps.map(step => (
                    <li key={step}>{step}</li>
                  ))}
                </ul>
              </div>
            </div>
            <div className={`
              mt-4 rounded-xl border border-dashed border-slate-300/70
              bg-slate-50/70 p-3 text-sm text-slate-700
              dark:border-white/15 dark:bg-white/5 dark:text-slate-200
            `}
            >
              <p className="font-semibold">{copy.exampleTitle}</p>
              <code className={`
                mt-2 block whitespace-pre-wrap rounded-lg bg-black/90 px-3 py-3
                text-xs text-emerald-200 shadow-[0_8px_30px_rgba(0,0,0,0.35)]
              `}
              >
                {formatTemplate(copy.examplePrompt, baseUrl)}
              </code>
            </div>
          </section>
        </div>
      </main>
    </Layout>
  )
}
