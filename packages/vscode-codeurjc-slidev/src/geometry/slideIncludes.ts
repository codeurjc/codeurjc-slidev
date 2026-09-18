// A slide can pull its content in from another markdown file with `src:` in
// its frontmatter, while its `geometry` stays in the including slide's own
// frontmatter. The theme never notices -- it resolves entries against the
// rendered DOM, wherever the content came from -- but a scan of this file
// alone sees no content to match against, and would report every entry as
// matching nothing.
//
// So resolution diagnostics are suppressed for those slides. A false "this
// matches nothing" on a perfectly good entry would cost more trust than the
// missed diagnostics are worth, and there is no way to recover the content
// without following the include.

import type { SlideSpan } from '../documentScan'

const SRC_RE = /^src\s*:(.*)$/m

/**
 * The file a slide's frontmatter includes with `src:`, or null. The value is
 * returned as written, unquoted; it is only ever used to decide whether the
 * slide's content lives elsewhere.
 */
export function slideIncludeSrc(slide: SlideSpan): string | null {
  const raw = SRC_RE.exec(slide.frontmatter)?.[1]?.trim()
  if (!raw)
    return null
  const unquoted = /^(["'])(.*)\1$/.exec(raw)?.[2] ?? raw
  const value = unquoted.replace(/\s+#.*$/, '').trim()
  return value === '' ? null : value
}

/** Whether a slide's content comes from another file, so its entries cannot be resolved from this document. */
export function hasExternalContent(slide: SlideSpan): boolean {
  return slideIncludeSrc(slide) !== null
}
