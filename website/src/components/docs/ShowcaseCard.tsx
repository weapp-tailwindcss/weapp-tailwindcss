import { useCurrentSiteLocale } from '@site/src/i18n/runtime'
import { useEffect, useId, useState, type ReactNode } from 'react'

type ShowcaseImage = {
  src: string
  alt?: string
  width?: number | null
  height?: number | null
}

type ShowcaseLink = {
  text: string
  url?: string
}

type ShowcaseCardProps = {
  title: string
  titleHref?: string
  authorLogin?: string
  authorUrl?: string
  createdAt: string
  commentUrl: string
  link?: ShowcaseLink
  github?: ShowcaseLink
  primaryImage: ShowcaseImage
  screenshots?: ShowcaseImage[]
  children?: ReactNode
}

function ShowcaseExternalLink({ value }: { value: ShowcaseLink }) {
  if (value.url) {
    return <a href={value.url}>{value.text}</a>
  }

  return <>{value.text}</>
}

function ShowcaseImageButton({
  image,
  label,
  className,
  frameClassName,
  locale,
  onOpen,
}: {
  image: ShowcaseImage
  label: string
  className?: string
  frameClassName?: string
  locale: 'zh-cn' | 'en'
  onOpen: (image: ShowcaseImage) => void
}) {
  const alt = image.alt || label

  return (
    <button
      type="button"
      className={`showcase-card__image-button${frameClassName ? ` ${frameClassName}` : ''}`}
      onClick={() => onOpen({ ...image, alt })}
      aria-label={locale === 'en' ? `Zoom image: ${alt}` : `放大查看：${alt}`}
    >
      <img className={className} loading="lazy" src={image.src} alt={alt} />
      <span className="showcase-card__zoom-hint" aria-hidden="true" />
    </button>
  )
}

export default function ShowcaseCard({
  title,
  titleHref,
  authorLogin,
  authorUrl,
  createdAt,
  commentUrl,
  link,
  github,
  primaryImage,
  screenshots = [],
  children,
}: ShowcaseCardProps) {
  const locale = useCurrentSiteLocale()
  const [expanded, setExpanded] = useState(true)
  const [previewImage, setPreviewImage] = useState<ShowcaseImage | null>(null)
  const panelId = useId()
  const hasScreenshots = screenshots.length > 0
  const titleContent = titleHref ? <a href={titleHref}>{title}</a> : title

  useEffect(() => {
    if (!previewImage) {
      return undefined
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setPreviewImage(null)
      }
    }

    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = overflow
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [previewImage])

  return (
    <article className={`showcase-card${hasScreenshots ? ' showcase-card--with-screenshots' : ''}`}>
      <header className="showcase-card__header">
        <h3 id={title}>
          {titleContent}
          <a className="showcase-card__anchor" href={`#${title}`} aria-label={locale === 'en' ? `Direct link to ${title}` : `${title} 的直接链接`}>
            #
          </a>
        </h3>
        <p className="showcase-card__meta">
          <strong>{locale === 'en' ? 'Submitted by: ' : '提交者：'}</strong>
          {authorLogin && authorUrl ? <a href={authorUrl}>@{authorLogin}</a> : (locale === 'en' ? 'Anonymous' : '匿名')}
          <span aria-hidden="true"> · </span>
          <span>{createdAt}</span>
          <span aria-hidden="true"> · </span>
          <a href={commentUrl}>{locale === 'en' ? 'View comment' : '查看评论'}</a>
        </p>
      </header>

      {(link || github || children) ? (
        <div className="showcase-card__body">
          {link ? (
            <p>
              <strong>{locale === 'en' ? 'Link: ' : '链接：'}</strong>
              <ShowcaseExternalLink value={link} />
            </p>
          ) : null}
          {github ? (
            <p>
              <strong>{locale === 'en' ? 'GitHub: ' : 'GitHub：'}</strong>
              <ShowcaseExternalLink value={github} />
            </p>
          ) : null}
          {children}
        </div>
      ) : null}

      <div className="showcase-card__media">
        <figure className="showcase-card__primary">
          {hasScreenshots ? <figcaption>{locale === 'en' ? 'Mini app code' : '小程序码'}</figcaption> : null}
          <ShowcaseImageButton
            image={primaryImage}
            label={title}
            className="showcase-card__image"
            frameClassName="showcase-card__image-button--code"
            locale={locale}
            onOpen={setPreviewImage}
          />
        </figure>

        {hasScreenshots ? (
          <section className="showcase-card__screenshots" aria-labelledby={`${panelId}-button`}>
            <button
              id={`${panelId}-button`}
              type="button"
              className="showcase-card__toggle"
              aria-expanded={expanded}
              aria-controls={panelId}
              onClick={() => setExpanded(value => !value)}
            >
              <span className="showcase-card__caret" aria-hidden="true" />
              <span className="showcase-card__toggle-label">{locale === 'en' ? 'Screenshots' : '作品截图'}</span>
              <span className="showcase-card__count">
                {locale === 'en' ? `(${screenshots.length})` : `（${screenshots.length} 张）`}
              </span>
            </button>

            <div id={panelId} className="showcase-card__shot-panel" hidden={!expanded}>
              <div className="showcase-card__shot-grid">
                {screenshots.map((image, index) => (
                  <ShowcaseImageButton
                    key={`${image.src}-${index}`}
                    image={image}
                    label={locale === 'en' ? `${title} screenshot ${index + 1}` : `${title} 截图 ${index + 1}`}
                    className="showcase-card__image showcase-card__shot"
                    frameClassName="showcase-card__image-button--shot"
                    locale={locale}
                    onOpen={setPreviewImage}
                  />
                ))}
              </div>
            </div>
          </section>
        ) : null}
      </div>

      {previewImage ? (
        <div
          className="showcase-card__lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={locale === 'en' ? `Image preview: ${previewImage.alt || title}` : `图片预览：${previewImage.alt || title}`}
          onClick={() => setPreviewImage(null)}
        >
          <button
            type="button"
            className="showcase-card__lightbox-close"
            onClick={() => setPreviewImage(null)}
            aria-label={locale === 'en' ? 'Close image preview' : '关闭图片预览'}
          >
            ×
          </button>
          <div className="showcase-card__lightbox-frame" onClick={event => event.stopPropagation()}>
            <img src={previewImage.src} alt={previewImage.alt || title} />
          </div>
        </div>
      ) : null}
    </article>
  )
}
