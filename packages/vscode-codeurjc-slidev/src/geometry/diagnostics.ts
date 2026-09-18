// Geometry diagnostics for an open `slides.md`, produced entirely from the
// document text -- no dev server, no DOM.
//
// Every condition reported here comes from the theme's own
// `parseSlideGeometry` and `resolveGeometryElements`, which are pure and take
// a DOM-free candidate summary. The extension only supplies that summary (from
// `collectSlideCandidates`) and maps each returned warning onto a document
// range. Nothing about the grammar is reimplemented, so a new rule in the
// theme shows up here without this file changing.
//
// Today those 22 warnings reach the author only through a single `console.warn`
// in `layouts/default.vue`, which is invisible without devtools open -- and an
// entry that resolves to nothing leaves its element in normal flow, a failure
// with no pixels at all.

import type { DocRange } from './frontmatterRanges'
import { parseSlideGeometry, resolveGeometryElements } from 'codeurjc-slidev-theme/composables/useSlideGeometry'
import { splitSlides } from '../documentScan'
import { collectSlideCandidates } from './candidates'
import { indexFrontmatter } from './frontmatterRanges'
import { hasExternalContent } from './slideIncludes'

export interface GeometryDiagnostic {
  range: DocRange
  message: string
  severity: 'warning'
  /** 1-based slide number the diagnostic belongs to. */
  slideNo: number
  /**
   * `grammar` -- the entry is malformed, judged from the entry alone.
   * `resolution` -- the entry is well-formed but doesn't match the slide's content.
   */
  kind: 'grammar' | 'resolution'
}

/** The field path a theme warning leads with (`geometry.images[0].x must be a number` → `geometry.images[0].x`). */
const FIELD_PATH_RE = /^([A-Z_]\w*(?:\.\w+|\[\d+\])*)/i

/**
 * Every geometry problem in `text`.
 *
 * Slides using a layout other than `default` are skipped: only
 * `layouts/default.vue` reads `geometry`, so an entry elsewhere is inert
 * rather than wrong. An absent `layout:` counts as `default`, matching how the
 * click model already reads slide frontmatter.
 */
export function geometryDiagnostics(text: string): GeometryDiagnostic[] {
  const diagnostics: GeometryDiagnostic[] = []

  for (const slide of splitSlides(text)) {
    const layout = /^layout:\s*['"]?([^'"\s#]+)/m.exec(slide.frontmatter)?.[1]
    if (layout && layout !== 'default')
      continue
    if (!/^geometry\s*:/m.test(slide.frontmatter))
      continue

    const index = indexFrontmatter(slide.frontmatter, slide.startLine + 1)
    const geometry = parseSlideGeometry(index.data)

    const fallback: DocRange = index.rangeOf('geometry') ?? {
      startLine: slide.startLine + 1,
      startChar: 0,
      endLine: slide.startLine + 1,
      endChar: 0,
    }
    const push = (message: string, kind: GeometryDiagnostic['kind']) => {
      const path = FIELD_PATH_RE.exec(message)?.[1]
      diagnostics.push({
        range: (path && index.rangeOf(path)) || fallback,
        message,
        severity: 'warning',
        slideNo: slide.no,
        kind,
      })
    }

    for (const warning of geometry.warnings)
      push(warning, 'grammar')

    // A slide whose content is pulled in with `src:` has nothing here to
    // resolve against, so every entry would look like it matches nothing.
    if (hasExternalContent(slide))
      continue

    const { candidates, srcs, otherIds } = collectSlideCandidates(text, slide)
    for (const warning of resolveGeometryElements(geometry, candidates, srcs, otherIds).warnings)
      push(warning, 'resolution')
  }

  return diagnostics
}
