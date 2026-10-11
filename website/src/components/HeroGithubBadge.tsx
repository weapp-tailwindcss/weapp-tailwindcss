import type { JSX } from 'react'
import { formatGitHubStarCount, useGitHubStars } from '../utils/github'

const GITHUB_OWNER = 'weapp-tailwindcss'
const GITHUB_REPO = 'weapp-tailwindcss'

interface HeroGithubBadgeProps {
  className?: string
}

export default function HeroGithubBadge({ className }: HeroGithubBadgeProps = {}): JSX.Element {
  const { stars } = useGitHubStars(GITHUB_OWNER, GITHUB_REPO)
  const displayStars = formatGitHubStarCount(stars)

  return (
    <a
      className={`
        group inline-flex min-h-10 items-center gap-2 rounded-full border
        border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700
        transition-all duration-200 hover:-translate-y-0.5 hover:border-[#0ea5e9]/45
        focus-visible:outline focus-visible:outline-2
        focus-visible:outline-offset-2 focus-visible:outline-[#0ea5e9]
        dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200
        ${className ?? ''}
      `}
      href="https://github.com/weapp-tailwindcss/weapp-tailwindcss"
      target="_blank"
      rel="noreferrer"
      aria-label="Star weapp-tailwindcss/weapp-tailwindcss on GitHub"
    >
      <i aria-hidden="true" className="icon-[mdi--github] text-[1.1rem] text-slate-800 dark:text-slate-100"></i>
      <span className={`
        hidden text-xs font-semibold uppercase tracking-[0.14em] text-slate-500
        sm:inline
        dark:text-slate-400
      `}
      >
        GitHub
      </span>
      <span className={`
        min-w-[2.8rem] text-right text-sm font-semibold tabular-nums
        text-slate-800
        sm:min-w-[3.6rem]
        dark:text-slate-100
      `}
      >
        {displayStars}
      </span>
    </a>
  )
}
