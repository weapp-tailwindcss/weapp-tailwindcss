export interface ShowcaseImage {
  src: string
  alt?: string
}

export interface ShowcaseLink {
  text: string
  url?: string
}

export interface ShowcaseEntry {
  id: string
  name: string
  createdAt: string
  authorLogin?: string
  authorUrl?: string
  commentUrl: string
  titleHref?: string
  link?: ShowcaseLink
  github?: ShowcaseLink
  primaryImage: ShowcaseImage
  screenshots: ShowcaseImage[]
}

export interface ShowcaseCatalog {
  issueUrl: string
  generatedAt: string
  entries: ShowcaseEntry[]
}

export interface ShowcaseTranslation {
  title: string
  linkText?: string
  githubText?: string
}
