// Records every content image's `src` as the author wrote it in a `data-src`
// attribute, so frontmatter can refer to an image by its `src` (see
// useImageRefs.ts). The rendered `src` can't be used: Slidev turns a slide's
// image URLs into bundled asset imports (a `/@fs/...` URL in dev, a hashed
// `/assets/...` one in a built deck), while `data-src` is left alone.
//
// Registered as a markdown-it plugin through the theme's `vite.config.ts`
// (`slidev.markdown.markdownSetup`). Covers markdown images (`![](...)`) and
// raw `<img>` tags, inline or as HTML blocks.

interface Token {
  type: string
  content: string
  children: Token[] | null
  attrGet: (name: string) => string | null
  attrSet: (name: string, value: string) => void
}

interface MarkdownIt {
  core: { ruler: { push: (name: string, rule: (state: { tokens: Token[] }) => void) => void } }
}

const IMG_TAG_RE = /<img\b[^>]*>/gi
const SRC_ATTR_RE = /\ssrc\s*=\s*(?:"([^"]*)"|'([^']*)')/i
const DATA_SRC_ATTR_RE = /\sdata-src\s*=/i

function escapeAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
}

/** Adds `data-src` (a copy of `src`) to every `<img>` tag in an HTML fragment that has a static `src` and no `data-src` yet. */
export function stampHtmlImages(html: string): string {
  return html.replace(IMG_TAG_RE, (tag) => {
    const src = SRC_ATTR_RE.exec(tag)
    if (!src || DATA_SRC_ATTR_RE.test(tag))
      return tag
    const value = src[1] ?? src[2]
    return tag.replace(/\s*(\/?)>$/, ` data-src="${escapeAttribute(value)}"$1>`)
  })
}

function stampTokens(tokens: Token[]): void {
  for (const token of tokens) {
    if (token.type === 'image') {
      const src = token.attrGet('src')
      if (src !== null && token.attrGet('data-src') === null)
        token.attrSet('data-src', src)
    }
    else if (token.type === 'html_inline' || token.type === 'html_block') {
      token.content = stampHtmlImages(token.content)
    }
    if (token.children)
      stampTokens(token.children)
  }
}

/** The markdown-it plugin. */
export function markdownImageSrc(md: MarkdownIt): void {
  md.core.ruler.push('codeurjc_image_src', (state) => {
    stampTokens(state.tokens)
  })
}
