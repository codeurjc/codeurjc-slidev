// Title/subtitle carry-over: on `default`-layout slides, a missing leading
//   # Title
//   ## Subtitle
// is inherited from the nearest preceding `default`-layout slide that set
// one, tracked independently per level. An empty heading (`#` / `##` with no
// text) or the `resetTitle: true` frontmatter flag clears both chains from
// that slide forward until a new explicit heading appears.
// Runs in a Node context (setup/preparser.ts) and in unit tests; deliberately
// has no Vue or DOM dependency.

export type HeadingState
  = | { kind: 'own', text: string }
    | { kind: 'empty' }
    | { kind: 'absent' }

export interface LeadingHeadings {
  title: HeadingState
  subtitle: HeadingState
}

export interface ResolvedHeadings {
  title?: string
  subtitle?: string
}

export interface SlideForHeadingResolve {
  content: string
  frontmatter: Record<string, unknown> | undefined
}

/** Slide-frontmatter key that resets both the title and subtitle carry chains at once. */
export const RESET_HEADINGS_FRONTMATTER_KEY = 'resetTitle'

function matchHeadingLine(line: string, level: 1 | 2): { text: string } | null {
  const re = level === 1 ? /^#(?!#)[ \t]*(.*)$/ : /^##(?!#)[ \t]*(.*)$/
  const m = re.exec(line)
  if (!m)
    return null
  return { text: m[1].trim() }
}

/**
 * Reads only the leading lines of a slide's (trimmed) content: an optional
 * `# ...` line, immediately followed (no blank line) by an optional `## ...`
 * line. Deliberately narrower than a generic "find the first heading"
 * search -- it mirrors `layouts/default.vue`'s `h1:first-child` convention,
 * so a heading anywhere else in the slide body is not "own" for carry-over
 * purposes.
 */
export function parseLeadingHeadings(content: string): LeadingHeadings {
  const lines = content.split('\n')
  let i = 0
  while (i < lines.length && lines[i].trim() === '') i++

  let title: HeadingState = { kind: 'absent' }
  const titleMatch = i < lines.length ? matchHeadingLine(lines[i], 1) : null
  if (titleMatch) {
    title = titleMatch.text === '' ? { kind: 'empty' } : { kind: 'own', text: titleMatch.text }
    i++
  }

  let subtitle: HeadingState = { kind: 'absent' }
  const subtitleMatch = i < lines.length ? matchHeadingLine(lines[i], 2) : null
  if (subtitleMatch) {
    subtitle = subtitleMatch.text === '' ? { kind: 'empty' } : { kind: 'own', text: subtitleMatch.text }
  }

  return { title, subtitle }
}

/** A slide with no explicit `layout` (or `layout: default`) is what carry-over applies to. */
export function isDefaultLayout(frontmatter: Record<string, unknown> | undefined): boolean {
  const layout = frontmatter?.layout
  return layout === undefined || layout === null || layout === 'default'
}

export function hasResetHeadingsFlag(frontmatter: Record<string, unknown> | undefined): boolean {
  return frontmatter?.[RESET_HEADINGS_FRONTMATTER_KEY] === true
}

/** Advances one level's carry state given this slide's own heading state for that level. */
function nextLevelState(own: HeadingState, carried: string | undefined, reset: boolean): string | undefined {
  if (own.kind === 'own')
    return own.text
  if (own.kind === 'empty' || reset)
    return undefined
  return carried
}

/**
 * Advances the running carry state by one slide. Shared by both the
 * all-at-once resolver below (used by unit tests and anywhere the full slide
 * list is at hand) and `setup/preparser.ts`'s `transformSlide` hook, which
 * only ever sees one slide at a time but processes the deck in strict
 * document order within a single parse pass -- so accumulating this same
 * step function's result slide-by-slide there is equivalent, by
 * construction, to calling `resolveSlideHeadings` for each index (see
 * design.md's note on the two hooks never being able to drift).
 */
export function advanceCarryState(state: ResolvedHeadings, slide: SlideForHeadingResolve): ResolvedHeadings {
  if (!isDefaultLayout(slide.frontmatter))
    return state
  const own = parseLeadingHeadings(slide.content)
  const reset = hasResetHeadingsFlag(slide.frontmatter)
  return {
    title: nextLevelState(own.title, state.title, reset),
    subtitle: nextLevelState(own.subtitle, state.subtitle, reset),
  }
}

/**
 * Resolves the effective title/subtitle for `slides[index]` by sweeping
 * forward from the start of the deck, tracking each level's carry chain
 * independently and skipping (not breaking on) any non-`default`-layout
 * slide. Deliberately stateless across calls -- everything needed is read
 * from `slides` on every invocation, so it doesn't matter what order slides
 * are resolved in or whether earlier slides were "already processed" in the
 * current session (see design.md).
 */
export function resolveSlideHeadings(slides: SlideForHeadingResolve[], index: number): ResolvedHeadings {
  let state: ResolvedHeadings = {}
  for (let i = 0; i <= index; i++) state = advanceCarryState(state, slides[i])
  return state
}

/**
 * Rebuilds a slide's content with whichever of title/subtitle it doesn't
 * provide itself (per `own`) spliced in from `resolved`, as literal `# `/
 * `## ` lines, so the layout's existing `h1:first-child` styling picks them
 * up. A slide's own heading (or explicit empty heading) at a level is kept
 * verbatim; a carried value is inserted at that level's position -- title
 * before subtitle -- without disturbing the other level or the rest of the
 * body.
 */
export function injectCarriedHeadings(content: string, own: LeadingHeadings, resolved: ResolvedHeadings): string {
  const lines = content.split('\n')
  let i = 0
  while (i < lines.length && lines[i].trim() === '') i++
  const leadingBlank = lines.slice(0, i)
  if (own.title.kind !== 'absent')
    i++
  if (own.subtitle.kind !== 'absent')
    i++
  const rest = lines.slice(i)

  const out: string[] = [...leadingBlank]
  if (own.title.kind === 'own')
    out.push(`# ${own.title.text}`)
  else if (own.title.kind === 'empty')
    out.push('#')
  else if (resolved.title !== undefined)
    out.push(`# ${resolved.title}`)

  if (own.subtitle.kind === 'own')
    out.push(`## ${own.subtitle.text}`)
  else if (own.subtitle.kind === 'empty')
    out.push('##')
  else if (resolved.subtitle !== undefined)
    out.push(`## ${resolved.subtitle}`)

  if (out.length === leadingBlank.length)
    return content
  return [...out, ...rest].join('\n')
}
