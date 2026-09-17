// Counts a slide's clicks from its markdown the way Slidev does at runtime, so
// the editor can show at which click a highlight or a fence range appears.
//
// Slidev (`@slidev/client` 52) gives every click source a registration with
// the slide's ClicksContext when it mounts: children before their parents,
// siblings in document order. `calculateSince(at, size)` turns an `at` value
// into a start: a relative `+N` starts N after the sum of the relative clicks
// registered so far, a number starts exactly there and shifts nothing. The
// slide's total is the highest click any registration reaches, unless the
// frontmatter sets `clicks:`.
//
// Anything that can register clicks in a way the text doesn't reveal (a bound
// value, a custom component, magic-move) makes the slide *uncountable* from
// that point: absolute clicks stay exact, relative ones after it don't, and the
// total is unknown. Numbers are either what Slidev does or not given at all.

import type { StepRange } from 'codeurjc-slidev-theme/composables/stepRange'
import type { SlideSpan } from './documentScan'
import { parseFenceInfo } from 'codeurjc-slidev-theme/composables/fenceInfo'
import { parseStepRange, rangeRegistrations } from 'codeurjc-slidev-theme/composables/stepRange'
import { extractInlineSourceLink, isInlineSourceMarkerLine, parseAnchorLine, parseCodeHighlights, parseExternalHighlightAnchors } from 'codeurjc-slidev-theme/composables/useCodeHighlights'
import { isAnchorDeclarationLine, isSourceDirectiveLine, parseSnippetImportLine, parseSnippetSelector, resolveSnippetSelector } from 'codeurjc-slidev-theme/composables/useSnippetImport'
import { splitSlides } from './documentScan'

export type ClickSourceKind = 'marker' | 'anchor' | 'callout' | 'fence-range' | 'v-click' | 'v-after' | 'v-clicks' | 'gap'

export interface FenceSegment {
  /** 0-based document line the segment's badge belongs on. */
  line: number
  /** The click the segment appears at, or null when that isn't exact. */
  click: number | null
}

export interface ClickRegistration {
  kind: ClickSourceKind
  /** 0-based document line of the source. */
  line: number
  /** First click the source reacts to, or null when that isn't exact. */
  start: number | null
  /** Highest click the source reaches, or null when that isn't exact. */
  max: number | null
  /** Whether `start`/`max` are exactly what Slidev computes. */
  exact: boolean
  /** For a fence with native ranges: one entry per segment after the first. */
  segments?: FenceSegment[]
  /** For a marker, anchor or callout: its click step or step range. */
  range?: StepRange
}

export interface UncountableSource {
  /** 0-based document line. */
  line: number
  /** Short description of the source, e.g. `<MyStepper>`. */
  source: string
}

export interface SlideClicks {
  slide: SlideSpan
  registrations: ClickRegistration[]
  /** The slide's total clicks, or null when it can't be counted. */
  total: number | null
  uncountable: UncountableSource[]
}

export interface ClickModelOptions {
  /** Reads a `<<<` import's file text (`@/…` path as written); null when it doesn't resolve. Without it, anchor steps are read from the anchor syntax alone. */
  resolveImportText?: (importFilePath: string) => string | null
  /** The project's own component names (from `components/`), in any case; a tag naming one may register clicks. */
  componentNames?: ReadonlySet<string>
}

// --- `at` values -----------------------------------------------------------

type SingleAt = { kind: 'relative', n: number } | { kind: 'absolute', n: number }
type AtValue = SingleAt | { kind: 'range', from: SingleAt, to: SingleAt } | { kind: 'off' }

/** Slidev's `normalizeSingleAtValue`, for a value that is already a JS value. */
function normalizeSingle(value: string | number | boolean | undefined): SingleAt | 'off' | null {
  if (value === false || value === 'false')
    return 'off'
  if (value === undefined || value === true || value === 'true')
    return { kind: 'relative', n: 1 }
  if (typeof value === 'string' && value !== '' && '+-'.includes(value[0])) {
    const n = Number(value)
    return Number.isFinite(n) ? { kind: 'relative', n } : null
  }
  const n = Number(value)
  if (Number.isNaN(n))
    return null
  return { kind: 'absolute', n: n <= 0 ? 1 : n }
}

const NUMBER_RE = /^[+-]?\d+(?:\.\d+)?$/
const QUOTED_RE = /^(['"`])(.*)\1$/

/** Evaluates a literal JS expression (a directive value or a bound prop) to a JS value; `undefined` means "not a literal". */
function literalValue(expr: string): { value: string | number | boolean } | undefined {
  const e = expr.trim()
  if (NUMBER_RE.test(e))
    return { value: Number(e) }
  const quoted = QUOTED_RE.exec(e)
  if (quoted && !quoted[2].includes('${'))
    return { value: quoted[2] }
  if (e === 'true' || e === 'false')
    return { value: e === 'true' }
  return undefined
}

/** A directive's value (`v-click="…"`), which Vue evaluates as an expression. `null` = not countable. */
function parseDirectiveAt(expr: string | undefined): AtValue | null {
  if (expr === undefined || expr.trim() === '')
    return normalizeOrNull(undefined)
  const array = /^\[([^,[\]]+),([^,[\]]+)\]$/.exec(expr.trim())
  if (array) {
    const from = literalValue(array[1])
    const to = literalValue(array[2])
    if (!from || !to)
      return null
    const a = normalizeSingle(from.value)
    const b = normalizeSingle(to.value)
    if (!a || !b || a === 'off' || b === 'off')
      return null
    return { kind: 'range', from: a, to: b }
  }
  const literal = literalValue(expr)
  return literal ? normalizeOrNull(literal.value) : null
}

/** A plain (unbound) prop value, which arrives as a string. */
function parsePropAt(value: string | undefined): AtValue | null {
  return normalizeOrNull(value)
}

function normalizeOrNull(value: string | number | boolean | undefined): AtValue | null {
  const single = normalizeSingle(value)
  if (single === 'off')
    return { kind: 'off' }
  return single
}

// --- The registration list -------------------------------------------------

class ClickCounter {
  registrations: ClickRegistration[] = []
  uncountable: UncountableSource[] = []
  /** Sum of relative deltas so far; null once an uncountable source came first. */
  offset: number | null = 0

  markUncountable(line: number, source: string): void {
    this.uncountable.push({ line, source })
    this.offset = null
  }

  /** Slidev's `calculateSince(at, size)` + `register`. */
  since(kind: ClickSourceKind, line: number, at: SingleAt, size = 1): ClickRegistration {
    let start: number | null
    let max: number | null
    let exact = true
    if (at.kind === 'absolute') {
      start = at.n
      max = at.n + size - 1
    }
    else if (this.offset === null) {
      start = null
      max = null
      exact = false
    }
    else {
      start = this.offset + at.n
      max = this.offset + at.n + size - 1
      this.offset += at.n + size - 1
    }
    const registration: ClickRegistration = { kind, line, start, max, exact }
    this.registrations.push(registration)
    return registration
  }

  /**
   * A theme step or step range (markers, anchors, callouts): absolute
   * placeholders at its start and after its end, so no offset changes.
   * `start` is the first click it's visible at; `max` the last registered click.
   */
  step(kind: ClickSourceKind, line: number, range: StepRange): void {
    const clicks = rangeRegistrations(range)
    this.registrations.push({ kind, line, start: range.from ?? 0, max: clicks.length > 0 ? Math.max(...clicks) : 0, exact: true, range })
  }

  /** Slidev's `calculateRange([from, to])` + `register`. */
  range(kind: ClickSourceKind, line: number, from: SingleAt, to: SingleAt): void {
    if ((from.kind === 'relative' || to.kind === 'relative') && this.offset === null) {
      this.registrations.push({ kind, line, start: from.kind === 'absolute' ? from.n : null, max: null, exact: false })
      return
    }
    let delta = 0
    const start = from.kind === 'relative' ? this.offset! + from.n : from.n
    if (from.kind === 'relative')
      delta += from.n
    const end = to.kind === 'relative' ? start + to.n : to.n
    if (to.kind === 'relative')
      delta += to.n
    if (this.offset !== null)
      this.offset += delta
    this.registrations.push({ kind, line, start, max: end, exact: true })
  }

  /** `VClickGap`: registers `delta = size` with `max = offset + size - 1`. */
  gap(line: number, size: number): void {
    if (this.offset === null) {
      this.registrations.push({ kind: 'gap', line, start: null, max: null, exact: false })
      return
    }
    const max = this.offset + size - 1
    this.offset += size
    this.registrations.push({ kind: 'gap', line, start: null, max, exact: true })
  }

  directive(kind: ClickSourceKind, line: number, at: AtValue): void {
    if (at.kind === 'off')
      return
    if (at.kind === 'range')
      this.range(kind, line, at.from, at.to)
    else this.since(kind, line, at)
  }
}

// --- Slide scanning --------------------------------------------------------

/** Click-free Slidev built-ins, as kebab-case names. */
const CLICK_FREE_COMPONENTS = new Set([
  'arrow',
  'auto-fit-text',
  'blue-sky',
  'code-block-wrapper',
  'code-group',
  'light-or-dark',
  'link',
  'mermaid',
  'plant-uml',
  'powered-by-slidev',
  'render-when',
  'router-link',
  'slide-current-no',
  'slides-total',
  'slidev-video',
  'toc',
  'toc-list',
  'transform',
  'transition',
  'tweet',
  'v-drag',
  'v-drag-arrow',
  'youtube',
])

const VOID_ELEMENTS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'])

function kebab(name: string): string {
  return name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').replace(/([A-Z])([A-Z][a-z])/g, '$1-$2').toLowerCase()
}

interface Attr { name: string, value?: string }

const ATTR_RE = /([^\s=/>"']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>"']+)))?/g

function parseAttrs(raw: string): Attr[] {
  const attrs: Attr[] = []
  for (const m of raw.matchAll(ATTR_RE))
    attrs.push({ name: m[1], value: m[2] ?? m[3] ?? m[4] })
  return attrs
}

function attr(attrs: Attr[], name: string): Attr | undefined {
  return attrs.find(a => a.name === name)
}

/** A component prop, plain (`at="+1"`) or bound (`:at="3"`); `null` = present but not countable. */
function propAt(attrs: Attr[], name: string): AtValue | null | undefined {
  const bound = attr(attrs, `:${name}`) ?? attr(attrs, `v-bind:${name}`)
  if (bound)
    return parseDirectiveAt(bound.value ?? '')
  const plain = attr(attrs, name)
  return plain ? parsePropAt(plain.value) : undefined
}

function propNumber(attrs: Attr[], name: string, fallback: number): number | null {
  const bound = attr(attrs, `:${name}`)
  if (bound) {
    const literal = literalValue(bound.value ?? '')
    const n = literal ? Number(literal.value) : Number.NaN
    return Number.isFinite(n) ? n : null
  }
  const plain = attr(attrs, name)
  if (!plain)
    return fallback
  const n = Number(plain.value)
  return Number.isFinite(n) ? n : null
}

type DirectiveAttr = { kind: 'v-click' | 'v-after', at: AtValue } | { kind: 'uncountable', source: string }

/** The click directives on one element (`v-click`, `v-click-hide`, `v-after`, modifiers allowed; `v-mark`/`v-motion` are uncountable). */
function directiveAttrs(attrs: Attr[]): DirectiveAttr[] {
  const out: DirectiveAttr[] = []
  for (const a of attrs) {
    const base = a.name.split('.')[0]
    if (base === 'v-click' || base === 'v-click-hide') {
      const at = parseDirectiveAt(a.value)
      out.push(at ? { kind: 'v-click', at } : { kind: 'uncountable', source: `${a.name}="${a.value}"` })
    }
    else if (base === 'v-after') {
      out.push({ kind: 'v-after', at: { kind: 'relative', n: 0 } })
    }
    else if (base.startsWith('v-mark') || base === 'v-motion') {
      out.push({ kind: 'uncountable', source: base })
    }
  }
  return out
}

interface Event {
  line: number
  col: number
  run: (counter: ClickCounter) => void
  /** Whether this event is itself a click source (for wrappers that can't contain one). */
  isSource: boolean
}

interface OpenElement {
  name: string
  line: number
  directives: DirectiveAttr[]
  component?: 'v-click' | 'v-after' | 'v-clicks'
  attrs: Attr[]
  containsSource: boolean
  /** Index in `lines` after the opening tag (for `<v-clicks>` list content). */
  contentStart: { line: number, col: number }
}

const LIST_ITEM_RE = /^(\s*)(?:[-*+]|\d+[.)])\s+/

/** Items of the markdown list between two positions, as depths (1 = top level), or null if the content isn't a single list. */
function listItemDepths(lines: string[]): number[] | null {
  const indents: number[] = []
  const depths: number[] = []
  let sawItem = false
  for (const line of lines) {
    if (!line.trim())
      continue
    const m = LIST_ITEM_RE.exec(line)
    if (!m) {
      // A continuation line of the previous item is fine; anything else isn't a list.
      if (sawItem && /^\s+\S/.test(line))
        continue
      return null
    }
    sawItem = true
    const indent = m[1].length
    while (indents.length > 0 && indent < indents[indents.length - 1])
      indents.pop()
    if (indents.length === 0 || indent > indents[indents.length - 1])
      indents.push(indent)
    depths.push(indents.length)
  }
  return sawItem ? depths : null
}

/**
 * `<v-clicks>` over a markdown list, as `VClicks.ts` does: each item at
 * `depth` or shallower gets a directive whose value is computed in document
 * order, and registers when it mounts (nested items before their parent);
 * then a trailing `VClickGap`.
 */
function registerVClicks(counter: ClickCounter, line: number, attrs: Attr[], depths: number[]): void {
  const declared = propAt(attrs, 'at')
  const at = declared === undefined ? { kind: 'relative', n: 1 } as AtValue : declared
  const every = propNumber(attrs, 'every', 1)
  const maxDepth = propNumber(attrs, 'depth', 1)
  if (!at || at.kind === 'range' || every === null || maxDepth === null || every <= 0) {
    counter.markUncountable(line, '<v-clicks>')
    return
  }
  if (at.kind === 'off')
    return

  const items = depths.map((depth, index) => ({ depth, index })).filter(i => i.depth <= maxDepth)
  let globalIdx = 1
  let execIdx = 0
  const values = items.map((item) => {
    const showIdx = at.n + Math.ceil(globalIdx++ / every) - 1
    const delta = showIdx - execIdx
    execIdx = showIdx
    return { item, value: at.kind === 'relative' ? { kind: 'relative', n: delta } as SingleAt : { kind: 'absolute', n: showIdx } as SingleAt }
  })

  // Mount order: an item's nested items (deeper, following it) mount before it.
  const order: typeof values = []
  const pending: typeof values = []
  for (const v of values) {
    while (pending.length > 0 && pending[pending.length - 1].item.depth >= v.item.depth)
      order.push(pending.pop()!)
    pending.push(v)
  }
  while (pending.length > 0) order.push(pending.pop()!)
  for (const v of order) counter.since('v-clicks', line, v.value)

  counter.gap(line, at.n + Math.ceil((globalIdx - 1) / every) - 1 - execIdx)
}

/** Replaces HTML comments with spaces, keeping line/column positions. */
function blankHtmlComments(lines: string[]): string[] {
  let inComment = false
  return lines.map((line) => {
    let out = ''
    let i = 0
    while (i < line.length) {
      if (inComment) {
        const end = line.indexOf('-->', i)
        if (end < 0) {
          out += ' '.repeat(line.length - i)
          i = line.length
        }
        else {
          out += ' '.repeat(end + 3 - i)
          i = end + 3
          inComment = false
        }
      }
      else {
        const start = line.indexOf('<!--', i)
        if (start < 0) {
          out += line.slice(i)
          i = line.length
        }
        else {
          out += line.slice(i, start)
          i = start
          inComment = true
        }
      }
    }
    return out
  })
}

const FENCE_RE = /^\s*(`{3,}|~{3,})(.*)$/

const TAG_RE = /<(\/?)([A-Z][\w.:-]*)((?:\s+[^\s=/>]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>"']+))?)*)\s*(\/?)>/gi
const MDC_ATTRS_RE = /\{([^{}\n]*\bv-(?:click|after|mark|motion)[^{}\n]*)\}/g
const INLINE_CODE_RE = /`[^`\n]*`/g

/** A literal `at` in a fence's `{…}` options: `{at: 3}`, `{at: '+2'}`. */
function fenceOptionAt(options: string | undefined): AtValue | null | undefined {
  if (!options)
    return undefined
  const m = /(?:^|[{,\s])at\s*:\s*([^,}]+)/.exec(options)
  return m ? parseDirectiveAt(m[1]) : undefined
}

function fenceOptionNumber(options: string | undefined, key: string): number | undefined {
  if (!options)
    return undefined
  const m = new RegExp(`(?:^|[{,\\s])${key}\\s*:\\s*(\\d+)`).exec(options)
  return m ? Number(m[1]) : undefined
}

/**
 * Counts the clicks of every slide in `text`.
 *
 * Registrations are listed in Slidev's registration order; `line`s are
 * 0-based document lines.
 */
export function computeDocumentClicks(text: string, options: ClickModelOptions = {}): SlideClicks[] {
  const docLines = text.split(/\r?\n/)
  return splitSlides(text).map(slide => computeSlideClicks(docLines, slide, options))
}

/** Counts one slide's clicks. `docLines` are the whole document's lines. */
export function computeSlideClicks(docLines: string[], slide: SlideSpan, options: ClickModelOptions = {}): SlideClicks {
  const counter = new ClickCounter()
  const first = slide.contentStartLine
  const lines = blankHtmlComments(docLines.slice(first, slide.endLine))
  const scan = [...lines]
  const events: Event[] = []

  const blank = (from: number, to: number) => {
    for (let i = from; i <= to && i < scan.length; i++) scan[i] = ''
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const docLine = first + i

    const fence = FENCE_RE.exec(line)
    if (fence) {
      const marker = fence[1]
      const close = new RegExp(`^\\s*${marker[0] === '`' ? '`' : '~'}{${marker.length},}\\s*$`)
      let j = i + 1
      while (j < lines.length && !close.test(lines[j])) j++
      if (j >= lines.length) {
        blank(i, lines.length - 1)
        break
      }
      events.push(fenceEvent(docLine, fence[2].trim(), docLines.slice(docLine + 1, first + j)))
      blank(i, j)
      i = j
      continue
    }

    if (/^\s*\$\$/.test(line)) {
      let j = i
      if (!/\$\$\s*$/.test(line.trim().slice(2))) {
        j = i + 1
        while (j < lines.length && !/\$\$\s*$/.test(lines[j])) j++
      }
      // KaTeX line ranges (`$$ {1|3}`) registered no clicks in any spelling
      // the ground-truth deck tried, so their count isn't known.
      const blockText = lines.slice(i, j + 1).join('\n')
      if (/^\s*\$\$\s*\{[\w*,|-]+\}/.test(blockText))
        events.push({ line: docLine, col: 0, isSource: true, run: c => c.markUncountable(docLine, 'KaTeX line ranges') })
      blank(i, Math.min(j, lines.length - 1))
      i = Math.min(j, lines.length - 1)
      continue
    }

    const imported = parseSnippetImportLine(line.trim())
    if (imported) {
      let j = i + 1
      const anchors: { line: number, text: string }[] = []
      while (j < lines.length) {
        const t = lines[j].trim()
        if (isAnchorDeclarationLine(t))
          anchors.push({ line: first + j, text: t })
        else if (!isSourceDirectiveLine(t))
          break
        j++
      }
      const steps = anchors.flatMap(a => anchorSteps(imported, a, options).map(click => ({ line: a.line, click })))
      events.push({
        line: docLine,
        col: 0,
        isSource: steps.length > 0,
        run: (c) => {
          for (const s of steps) c.step('anchor', s.line, s.click)
        },
      })
      blank(i, j - 1)
      i = j - 1
    }
  }

  tagEvents(scan, first, events, options)

  // Slide callouts' steps: absolute, registered by the theme's placeholders.
  for (const { line, step } of calloutSteps(slide))
    counter.step('callout', line, step)

  events.sort((a, b) => a.line - b.line || a.col - b.col)
  for (const e of events) e.run(counter)

  const frontmatterClicks = /^clicks:\s*(\d+)\s*$/m.exec(slide.frontmatter)
  const maxes = counter.registrations.map(r => r.max)
  let total: number | null
  if (frontmatterClicks)
    total = Number(frontmatterClicks[1])
  else if (counter.uncountable.length > 0 || maxes.includes(null))
    total = null
  else total = Math.max(0, ...(maxes as number[]))

  return { slide, registrations: counter.registrations, total, uncountable: counter.uncountable }
}

/**
 * The `step:` values of a `default`-layout slide's `callouts` frontmatter,
 * with their document lines. Read from the raw YAML (block or flow style)
 * without validating the entries, which the theme does before registering.
 */
function calloutSteps(slide: SlideSpan): { line: number, step: StepRange }[] {
  const lines = slide.frontmatter.split('\n')
  const layout = /^layout:\s*['"]?([^'"\s#]+)/m.exec(slide.frontmatter)?.[1]
  if (layout && layout !== 'default')
    return []
  const start = lines.findIndex(l => /^callouts\s*:/.test(l))
  if (start < 0)
    return []
  let end = start + 1
  while (end < lines.length && (/^[\s-]/.test(lines[end]) || lines[end].trim() === '' || lines[end].startsWith('#'))) end++
  const steps: { line: number, step: StepRange }[] = []
  for (let i = start; i < end; i++) {
    for (const m of lines[i].matchAll(/\bstep\s*:\s*(['"]?)(-?\d*-?\d*)\1/g)) {
      const step = parseStepRange(m[2])
      if (step)
        steps.push({ line: slide.startLine + 1 + i, step })
    }
  }
  return steps
}

/** A `<<<` anchor line's click steps: one per highlight it resolves to, as the theme registers them. */
function anchorSteps(imported: NonNullable<ReturnType<typeof parseSnippetImportLine>>, anchor: { text: string }, options: ClickModelOptions): StepRange[] {
  if (!options.resolveImportText) {
    const click = parseAnchorLine(anchor.text)?.click
    return click ? [click] : []
  }
  const fileText = options.resolveImportText(imported.filePath)
  if (fileText === null)
    return []
  const selector = imported.selectorRaw ? parseSnippetSelector(imported.selectorRaw) : null
  if (imported.selectorRaw && !selector)
    return []
  const slice = resolveSnippetSelector(fileText, selector, () => {})
  return parseExternalHighlightAnchors(slice.text, [anchor.text], { onWarn: () => {}, onError: () => {} })
    .flatMap(h => (h.click ? [h.click] : []))
}

/** A manual fence: its markers' steps (absolute) and its native ranges (relative unless `at` is a number). */
function fenceEvent(openLine: number, info: string, codeLines: string[]): Event {
  const lang = info.split(/[\s{[]/)[0]
  const isMagicMove = /\bmagic-move\b/.test(info)
  const isMonaco = /\{monaco[\w-]*\}/.test(info)
  const nonWrapper = isMagicMove || isMonaco || lang === 'mermaid' || lang === 'plantuml'

  // Rendered lines: the theme drops inline `// [!source]` marker lines first.
  const kept = codeLines.map((text, index) => ({ text, docLine: openLine + 1 + index })).filter(l => !isInlineSourceMarkerLine(l.text))
  const { code } = extractInlineSourceLink(codeLines.join('\n'))
  const markers = nonWrapper ? [] : parseCodeHighlights(code).highlights.filter(h => h.click)

  const { ranges, options } = parseFenceInfo(info)
  const startLine = fenceOptionNumber(options, 'startLine') ?? 1
  const at = fenceOptionAt(options)
  const hasRanges = !nonWrapper && ranges.length > 0
  const showOutputAt = isMonaco && /showOutputAt/.test(info)

  return {
    line: openLine,
    col: 0,
    isSource: markers.length > 0 || hasRanges || isMagicMove || showOutputAt,
    run: (c) => {
      // The theme's zero-size `v-click="N"` placeholders sit inside the wrapper, so they mount first.
      for (const m of markers) c.step('marker', kept[m.startLine]?.docLine ?? openLine + 1 + m.startLine, m.click!)
      if (isMagicMove)
        return c.markUncountable(openLine, 'magic-move code block')
      if (showOutputAt)
        return c.markUncountable(openLine, 'monaco-run `showOutputAt`')
      if (!hasRanges)
        return
      if (at === null)
        return c.markUncountable(openLine, 'code block `at` option')
      const single = at ?? { kind: 'relative', n: 1 } as AtValue
      if (single.kind === 'off')
        return
      if (single.kind === 'range')
        return c.markUncountable(openLine, 'code block `at` option')
      const registration = c.since('fence-range', openLine, single, ranges.length - 1)
      registration.segments = ranges.slice(1).map((range, index) => {
        const firstNumber = /^\s*(\d+)/.exec(range)
        const renderedLine = firstNumber ? Number(firstNumber[1]) - (startLine - 1) : Number.NaN
        const target = renderedLine >= 1 ? kept[renderedLine - 1] : undefined
        return {
          line: target?.docLine ?? openLine,
          click: registration.start === null ? null : registration.start + index,
        }
      })
    },
  }
}

/** Tags, MDC attribute blocks and components outside fences, processed with a tag stack so an element registers when it closes. */
function tagEvents(scan: string[], first: number, events: Event[], options: ClickModelOptions): void {
  const stack: OpenElement[] = []
  const sourceEvents = events.filter(e => e.isSource)

  interface Token { line: number, col: number, end: { line: number, col: number }, kind: 'open' | 'close' | 'self' | 'mdc', name: string, attrs: Attr[], raw: string }
  const tokens: Token[] = []
  const joined = scan.map(l => l.replace(INLINE_CODE_RE, m => ' '.repeat(m.length))).join('\n')
  const lineStarts: number[] = []
  let offset = 0
  for (const l of scan) {
    lineStarts.push(offset)
    offset += l.length + 1
  }
  const position = (index: number) => {
    let line = 0
    while (line + 1 < lineStarts.length && lineStarts[line + 1] <= index) line++
    return { line, col: index - lineStarts[line] }
  }

  for (const m of joined.matchAll(TAG_RE)) {
    const start = position(m.index!)
    const end = position(m.index! + m[0].length)
    const name = m[2]
    const selfClosing = m[4] === '/' || VOID_ELEMENTS.has(name.toLowerCase())
    tokens.push({ ...start, end, kind: m[1] ? 'close' : selfClosing ? 'self' : 'open', name, attrs: parseAttrs(m[3]), raw: m[0] })
  }
  for (const m of joined.matchAll(MDC_ATTRS_RE)) {
    const start = position(m.index!)
    tokens.push({ ...start, end: start, kind: 'mdc', name: '', attrs: parseAttrs(m[1]), raw: m[0] })
  }
  tokens.sort((a, b) => a.line - b.line || a.col - b.col)

  const markContaining = (line: number, col: number) => {
    for (const el of stack) {
      if (el.contentStart.line < line || (el.contentStart.line === line && el.contentStart.col <= col))
        el.containsSource = true
    }
  }

  // Block sources (fences, imports) inside an open element count as its content.
  let blockIndex = 0
  const sortedBlocks = [...sourceEvents].sort((a, b) => a.line - b.line)
  const flushBlocksBefore = (line: number, col: number) => {
    const isBefore = (block: Event) => block.line - first < line || (block.line - first === line && col > 0)
    while (blockIndex < sortedBlocks.length && isBefore(sortedBlocks[blockIndex])) {
      markContaining(sortedBlocks[blockIndex].line - first, 0)
      blockIndex++
    }
  }

  const emit = (line: number, col: number, run: (c: ClickCounter) => void) => {
    markContaining(line, col)
    events.push({ line: first + line, col: col + 1, run, isSource: true })
  }

  const classify = (name: string): 'v-click' | 'v-after' | 'v-clicks' | 'gap' | 'switch' | 'uncountable' | 'none' => {
    const k = kebab(name)
    if (k === 'v-click')
      return 'v-click'
    if (k === 'v-after')
      return 'v-after'
    if (k === 'v-clicks')
      return 'v-clicks'
    if (k === 'v-click-gap')
      return 'gap'
    if (k === 'v-switch')
      return 'switch'
    if (CLICK_FREE_COMPONENTS.has(k))
      return 'none'
    const names = options.componentNames
    if (names && (names.has(name) || names.has(k)))
      return 'uncountable'
    return /^[A-Z]/.test(name) ? 'uncountable' : 'none'
  }

  const emitDirectives = (line: number, col: number, directives: DirectiveAttr[]) => {
    for (const d of directives) {
      if (d.kind === 'uncountable')
        emit(line, col, c => c.markUncountable(first + line, d.source))
      else emit(line, col, c => c.directive(d.kind, first + line, d.at))
    }
  }

  const closeElement = (el: OpenElement, closeLine: number, closeCol: number) => {
    const line = el.line
    if (el.component) {
      const tag = `<${el.name}>`
      if (el.containsSource) {
        emit(closeLine, closeCol, c => c.markUncountable(first + line, `${tag} containing other click sources`))
      }
      else if (el.component === 'v-clicks') {
        const content = scan.slice(el.contentStart.line, closeLine + 1)
        if (content.length > 0) {
          content[0] = content[0].slice(el.contentStart.col)
          content[content.length - 1] = closeLine === el.contentStart.line
            ? scan[closeLine].slice(el.contentStart.col, closeCol)
            : content[content.length - 1].slice(0, closeCol)
        }
        const depths = listItemDepths(content)
        emit(closeLine, closeCol, c => depths ? registerVClicks(c, first + line, el.attrs, depths) : c.markUncountable(first + line, `${tag} not around a single list`))
      }
      else {
        const declared = el.component === 'v-after' ? undefined : propAt(el.attrs, 'at')
        const at = el.component === 'v-after' ? { kind: 'relative', n: 0 } as AtValue : declared === undefined ? { kind: 'relative', n: 1 } as AtValue : declared
        const kind = el.component
        emit(closeLine, closeCol, c => at ? c.directive(kind, first + line, at) : c.markUncountable(first + line, `${tag} \`at\` value`))
      }
    }
    emitDirectives(closeLine, closeCol, el.directives)
  }

  for (const t of tokens) {
    flushBlocksBefore(t.line, t.col)
    if (t.kind === 'mdc') {
      // MDC `{v-click}` attributes registered no clicks in the ground-truth deck; their count isn't known.
      emit(t.line, t.col, c => c.markUncountable(first + t.line, `MDC ${t.raw}`))
      continue
    }
    if (t.kind === 'close') {
      const index = stack.map(e => e.name.toLowerCase()).lastIndexOf(t.name.toLowerCase())
      if (index < 0)
        continue
      while (stack.length > index) {
        const el = stack.pop()!
        closeElement(el, t.line, t.col)
      }
      continue
    }

    const kind = classify(t.name)
    const directives = directiveAttrs(t.attrs)
    if (kind === 'switch' || kind === 'uncountable') {
      emit(t.line, t.col, c => c.markUncountable(first + t.line, `<${t.name}>`))
      if (t.kind === 'self')
        emitDirectives(t.line, t.col, directives)
      else stack.push({ name: t.name, line: t.line, directives, attrs: t.attrs, containsSource: false, contentStart: t.end })
      continue
    }
    if (kind === 'gap') {
      const size = propNumber(t.attrs, 'size', 1)
      emit(t.line, t.col, c => size === null ? c.markUncountable(first + t.line, `<${t.name}> size`) : c.gap(first + t.line, size))
      if (t.kind === 'open')
        stack.push({ name: t.name, line: t.line, directives, attrs: t.attrs, containsSource: false, contentStart: t.end })
      continue
    }

    const component = kind === 'none' ? undefined : kind
    if (t.kind === 'self') {
      if (component)
        closeElement({ name: t.name, line: t.line, directives, component, attrs: t.attrs, containsSource: false, contentStart: t.end }, t.line, t.col)
      else emitDirectives(t.line, t.col, directives)
      continue
    }
    stack.push({ name: t.name, line: t.line, directives, component, attrs: t.attrs, containsSource: false, contentStart: t.end })
  }
  flushBlocksBefore(scan.length, 0)
  while (stack.length > 0) {
    const el = stack.pop()!
    closeElement(el, scan.length - 1, scan[scan.length - 1]?.length ?? 0)
  }
}

/** The clicks of the slide containing `docLine`. */
export function slideClicksAt(slides: SlideClicks[], docLine: number): SlideClicks | undefined {
  return slides.find(s => docLine >= s.slide.startLine && docLine < s.slide.endLine)
}
