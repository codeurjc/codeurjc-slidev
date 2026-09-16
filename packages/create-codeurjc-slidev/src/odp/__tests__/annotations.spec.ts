import type { CodeMark } from '../annotations'
import { parseCodeHighlights, parseExternalHighlightAnchors } from 'codeurjc-slidev-theme/composables/useCodeHighlights'
import { describe, expect, it } from 'vitest'
import { annotateCodes, renderAnchorMarks, renderInlineMarks } from '../annotations'
import { classifySlide } from '../classify'
import { codeLinesOf } from '../code'
import { LINE_HEIGHT_FACTOR, PT_TO_CM } from '../constants'
import { parseOdp } from '../parse'
import { buildOdp, customShape, frame, line, p, page, textBox, xmlEscape } from './odpFixture'

// Modeled on the GitHub Actions deck: a YAML workflow in a monospace box with
// a WORKFLOW box around everything, a JOB box around the job, and a narrow
// box around `steps:` connected by an arrow to an explanation box.
const YAML = [
  'name: Continuous integration example',
  'on:',
  '  push:',
  'jobs:',
  '  test:',
  '    runs-on: ubuntu-latest',
  '    steps:',
  '      - uses: actions/checkout@v6',
  '      - run: mvn test',
]
const CODE_RECT = { x: 0.556, y: 3.723, w: 24, h: 14 }
const PADDING = 0.125
const LH = 14 * LINE_HEIGHT_FACTOR * PT_TO_CM
const top = (lineIndex: number) => CODE_RECT.y + PADDING + lineIndex * LH
const BODY_REGION = { x: 1.27, y: 4.457, w: 22.859, h: 11.048 }

function yamlSlide(extra: string) {
  const code = customShape('ooxml-rect', CODE_RECT, YAML.map(l => p(xmlEscape(l), 'Pmono')).join(''))
  const deck = parseOdp(buildOdp({ pages: [page(frame('title', { x: 0.5, y: 1.3, w: 22, h: 1.8 }, textBox(p('Integración Continua'))) + code + extra)] }))
  return classifySlide(deck.slides[0], deck)
}

describe('annotateCodes', () => {
  it('turns nested WORKFLOW/JOB boxes with labels into nested ranges', () => {
    const slide = yamlSlide([
      customShape('ooxml-rect', { x: 0.556, y: top(0) - 0.05, w: 23.5, h: 9 * LH + 0.1 }, '', 'grBox'),
      customShape('ooxml-rect', { x: 18.5, y: top(0), w: 4, h: 0.9 }, p('WORKFLOW')),
      customShape('ooxml-rect', { x: 1.5, y: top(4) - 0.05, w: 21, h: 5 * LH + 0.1 }, '', 'grBox'),
      customShape('ooxml-rect', { x: 18.5, y: top(4) + 0.02, w: 4, h: 0.5 }, p('JOB')),
    ].join(''))
    const result = annotateCodes(slide, BODY_REGION)
    const marks = result.marksByCode.get(slide.codes[0])!
    expect(marks.map(m => [m.kind, m.startLine, m.endLine, m.comment])).toEqual([
      ['range', 0, 8, 'WORKFLOW'],
      ['range', 4, 8, 'JOB'],
    ])
    expect(result.losses).toEqual([])
    expect(result.consumedTexts.size).toBe(2)
  })

  it('turns a narrow box around `steps:` plus an arrow to a text box into a substring callout', () => {
    const charW = 14 * 0.6 * PT_TO_CM
    const left = CODE_RECT.x + 0.25
    const slide = yamlSlide([
      customShape('ooxml-rect', { x: left + 4 * charW - 0.05, y: top(6) - 0.03, w: 6 * charW + 0.1, h: LH + 0.06 }, '', 'grBox'),
      line(left + 10 * charW + 0.05, top(6) + LH / 2, 12, 9),
      customShape('ooxml-rect', { x: 12, y: 8.5, w: 8, h: 2 }, p('Cada Job se ejecuta en un runner'), 'grBox'),
    ].join(''))
    const result = annotateCodes(slide, BODY_REGION)
    const [mark] = result.marksByCode.get(slide.codes[0])!
    expect(mark).toMatchObject({ kind: 'substring', startLine: 6, substring: { start: 4, end: 10 }, comment: 'Cada Job se ejecuta en un runner' })
    expect(mark.override!.x).toBeGreaterThan(400)
    expect(result.consumedConnectors.size).toBe(1)
  })

  it('turns a labeled frame around the whole code block into a whole-block range, and ignores an unlabeled one', () => {
    const frameBox = customShape('ooxml-rect', { x: CODE_RECT.x - 0.2, y: CODE_RECT.y - 0.2, w: CODE_RECT.w + 0.1, h: CODE_RECT.h + 0.4 }, '', 'grBox')
    const labeled = yamlSlide(frameBox + customShape('ooxml-rect', { x: 19, y: CODE_RECT.y - 0.1, w: 4, h: 0.9 }, p('WORKFLOW')))
    expect(labeled.codeFrames).toHaveLength(1)
    expect(labeled.annotationRects).toHaveLength(0)
    const [mark] = annotateCodes(labeled, BODY_REGION).marksByCode.get(labeled.codes[0])!
    expect(mark).toMatchObject({ kind: 'range', startLine: 0, endLine: 8, comment: 'WORKFLOW' })

    const unlabeled = yamlSlide(frameBox)
    const result = annotateCodes(unlabeled, BODY_REGION)
    expect(result.marksByCode.size).toBe(0)
    expect(result.losses).toEqual([])
  })

  it('uses the frame height as line height for an auto-grown code frame', () => {
    // A frame sized exactly to its 9 lines at a line height 10% larger than the font estimate.
    const grownLh = LH * 1.1
    const code = customShape('ooxml-rect', { x: 1, y: 4, w: 24, h: 9 * grownLh + 2 * PADDING }, YAML.map(l => p(xmlEscape(l), 'Pmono')).join(''))
    const box = customShape('ooxml-rect', { x: 1.5, y: 4 + PADDING + 7 * grownLh - 0.1, w: 20, h: 2 * grownLh + 0.2 }, '', 'grBox')
    const deck = parseOdp(buildOdp({ pages: [page(frame('title', { x: 0.5, y: 1.3, w: 22, h: 1.8 }, textBox(p('CI'))) + code + box)] }))
    const slide = classifySlide(deck.slides[0], deck)
    const [mark] = annotateCodes(slide, BODY_REGION).marksByCode.get(slide.codes[0])!
    expect(mark).toMatchObject({ kind: 'range', startLine: 7, endLine: 8 })
  })

  it('reports a box whose edges fall between lines', () => {
    const slide = yamlSlide(customShape('ooxml-rect', { x: 1, y: top(2) + LH / 2, w: 20, h: LH }, '', 'grBox'))
    const result = annotateCodes(slide, BODY_REGION)
    expect(result.losses).toEqual(['highlight box not aligned to code lines'])
  })

  it('turns an arrow from a callout straight into a code line into a line highlight', () => {
    const slide = yamlSlide([
      line(10, top(5) + LH / 2, 20, 14),
      customShape('ooxml-rect', { x: 19.8, y: 13.8, w: 5, h: 2 }, p('Runner image'), 'grBox'),
    ].join(''))
    const [mark] = annotateCodes(slide, BODY_REGION).marksByCode.get(slide.codes[0])!
    expect(mark).toMatchObject({ kind: 'line', startLine: 5, comment: 'Runner image' })
  })
})

describe('rendering marks', () => {
  const marks: CodeMark[] = [
    { kind: 'range', startLine: 0, endLine: 8, comment: 'WORKFLOW' },
    { kind: 'range', startLine: 4, endLine: 8, comment: 'JOB', click: 1 },
    { kind: 'substring', startLine: 6, endLine: 6, substring: { start: 4, end: 10 }, comment: 'Steps', override: { x: 500, y: 200 }, click: 2 },
  ]

  it('renders every mark inline, several on one line, and the theme parses them back', () => {
    const { lines, losses } = renderInlineMarks(YAML, marks, '#')
    expect(losses).toEqual([])
    // Both ranges end here: innermost (JOB) closes first.
    expect(lines[8]).toBe('      - run: mvn test # [!mark:end] [!mark:end]')
    expect(lines[0]).toBe('name: Continuous integration example # [!mark:start] WORKFLOW')
    expect(lines[4]).toBe('  test: # [!mark:start{1}] JOB')
    const parsed = parseCodeHighlights(lines.join('\n'))
    expect(parsed.code).toBe(YAML.join('\n'))
    expect(parsed.highlights.map(h => [h.kind, h.startLine, h.endLine, h.comment, h.click, h.override])).toEqual([
      ['range', 0, 8, 'WORKFLOW', undefined, undefined],
      ['range', 4, 8, 'JOB', 1, undefined],
      ['substring', 6, 6, 'Steps', 2, { x: 500, y: 200 }],
    ])
  })

  it('writes a substring mark and a range end on the same line', () => {
    const { lines, losses } = renderInlineMarks(YAML, [
      { kind: 'range', startLine: 4, endLine: 6, comment: 'JOB' },
      { kind: 'substring', startLine: 6, endLine: 6, substring: { start: 4, end: 9 }, comment: 'Steps' },
    ], '#')
    expect(losses).toEqual([])
    expect(lines[6]).toBe('    steps: # [!mark:end] [!mark(4-9)] Steps')
    const parsed = parseCodeHighlights(lines.join('\n'))
    expect(parsed.code).toBe(YAML.join('\n'))
    expect(parsed.highlights.map(h => [h.kind, h.startLine, h.endLine, h.comment])).toEqual([
      ['range', 4, 6, 'JOB'],
      ['substring', 6, 6, 'Steps'],
    ])
  })

  it('reports every mark for languages without line comments', () => {
    expect(renderInlineMarks(['<a/>'], [marks[0]], undefined).losses).toHaveLength(1)
  })

  it('renders anchor lines the theme resolves against the snippet', () => {
    const snippet = ['', ...YAML]
    const { anchors, losses } = renderAnchorMarks(codeLinesOf({ kind: 'shape', paragraphs: YAML.map(l => ({ runs: [{ text: l, bold: false, italic: false, mono: true }], depth: 0, isListHeader: false })), images: [], hasBorder: false, hasFill: false, paddingTop: 0.125 }), snippet, marks, i => i + 2)
    expect(losses).toEqual([])
    expect(anchors).toEqual(['[!mark:2..10] WORKFLOW', '[!mark:6..10{1}] JOB', '[!mark:"steps:"{2}@500,200] Steps'])
    const resolved = parseExternalHighlightAnchors(snippet.join('\n'), anchors, { onWarn: () => {}, onError: () => {} })
    expect(resolved.map(h => [h.kind, h.startLine, h.endLine, h.click])).toEqual([['range', 1, 9, undefined], ['range', 5, 9, 1], ['substring', 7, 7, 2]])
  })
})
