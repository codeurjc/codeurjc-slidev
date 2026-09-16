import type { DraftContext } from '../draft'
import { describe, expect, it } from 'vitest'
import { annotateCodes } from '../annotations'
import { mergeBuildUps } from '../buildups'
import { classifySlide } from '../classify'
import { diagramGroups } from '../diagrams'
import { draftSlide, renderDraftBody } from '../draft'
import { bodyRegionFor } from '../geometry'
import { shapeText } from '../model'
import { parseOdp } from '../parse'
import { buildOdp, customShape, frame, image, item, line, list, p, page, textBox, transformedShape } from './odpFixture'

// Diagrams modeled on the corpus: the Tema 1.1 methodology pipeline (slides
// 81-84), its rotated "Pruebas" arrow, and drawings over images like 2.2's
// hexagonal architecture.

const TITLE = frame('title', { x: 1.29, y: 1.7, w: 19.9, h: 2.8 }, textBox(p('Metodologías')))
const BOX_H = 2.2

function box(text: string, x: number, y = 7.6, w = 6.2): string {
  return customShape('rectangle', { x, y, w, h: BOX_H }, p(text), 'grFilled')
}

function rightArrow(x: number, y = 8.375): string {
  return customShape('right-arrow', { x, y, w: 1.243, h: 0.825 }, '', 'grFilled')
}

/** Requisitos → Análisis / Diseño → Implementación, as on Tema 1.1 slide 81. */
const PIPELINE = box('Requisitos', 1.8) + rightArrow(7.8) + box('Análisis / Diseño', 9, 7.6, 7.104) + rightArrow(15.957) + box('Implementación', 17.053, 7.6, 6.747)
/** The red arrow rotated to point up at "Requisitos", with its label under it (Tema 1.1 slide 84). */
const PRUEBAS = transformedShape('right-arrow', { w: 1.243, h: 0.825 }, 'rotate (1.5707963267949) translate (4.4cm 10.8cm)', '', 'grFilled')
  + customShape('mso-spt202', { x: 3.297, y: 10.6, w: 3.003, h: 0.961 }, p('Pruebas'))

function body(...paragraphs: string[]): string {
  return frame('outline', { x: 1.2, y: 4, w: 23.4, h: 15.05 }, textBox(...paragraphs))
}

function deckOf(pages: string[]) {
  return parseOdp(buildOdp({ pages, files: { 'Pictures/shot.png': new Uint8Array([1]) } }))
}

function draftsOf(pages: string[], options: { canEmbedDiagrams?: boolean } = {}) {
  const deck = deckOf(pages)
  const ctx: DraftContext = { deck, codeIndex: [], images: new Map(), imagePaths: new Map(), canEmbedDiagrams: options.canEmbedDiagrams }
  return deck.slides.map(s => draftSlide(classifySlide(s, deck), ctx))
}

function draftOf(inner: string, options: { canEmbedDiagrams?: boolean, hidden?: boolean } = {}) {
  const deck = deckOf([page(inner, { hidden: options.hidden })])
  const ctx: DraftContext = { deck, codeIndex: [], images: new Map(), imagePaths: new Map(), canEmbedDiagrams: options.canEmbedDiagrams }
  return { draft: draftSlide(classifySlide(deck.slides[0], deck), ctx), ctx }
}

function mermaidOf(inner: string): string | undefined {
  const block = draftOf(inner).draft.blocks.find(b => b.kind === 'diagram')
  return block?.kind === 'diagram' ? block.mermaid : undefined
}

describe('mermaid tier', () => {
  it('turns a pipeline of boxes and block arrows into a left-to-right flowchart', () => {
    const { draft } = draftOf(TITLE + PIPELINE)
    const block = draft.blocks.find(b => b.kind === 'diagram')
    expect(block?.kind === 'diagram' && block.mermaid).toBe([
      'flowchart LR',
      '  n1["Requisitos"]',
      '  n2["Análisis / Diseño"]',
      '  n3["Implementación"]',
      '  n1 --> n2',
      '  n2 --> n3',
    ].join('\n'))
    expect(draft.losses).toEqual([])
    expect(draft.info).toEqual(['diagram converted to a mermaid flowchart'])
    expect(renderDraftBody(draft, undefined).markdown).toContain('```mermaid\nflowchart LR\n')
  })

  it('turns a vertical chain into a top-to-bottom flowchart, following the arrows', () => {
    const down = (y: number) => customShape('down-arrow', { x: 4.5, y, w: 0.8, h: 1 }, '', 'grFilled')
    const source = mermaidOf(TITLE + box('Uno', 2, 5, 6) + down(7.2) + box('Dos', 2, 8.2, 6) + down(10.4) + box('Tres', 2, 11.4, 6))
    expect(source).toBe(['flowchart TB', '  n1["Uno"]', '  n2["Dos"]', '  n3["Tres"]', '  n1 --> n2', '  n2 --> n3'].join('\n'))
  })

  it('joins boxes with an undirected edge when the line has no arrowhead', () => {
    expect(mermaidOf(TITLE + box('A', 2) + line(8.2, 8.7, 10, 8.7) + box('B', 10))).toContain('  n1 --- n2')
  })

  it('points a line edge the way its arrowhead does', () => {
    expect(mermaidOf(TITLE + box('A', 2) + line(10, 8.7, 8.2, 8.7, 'grArrowEnd') + box('B', 10))).toContain('  n2 --> n1')
  })

  it('escapes quotes and angle brackets in labels and keeps line breaks', () => {
    const source = mermaidOf(TITLE + customShape('rectangle', { x: 2, y: 7.6, w: 6.2, h: BOX_H }, p('Chat &quot;demo&quot;') + p('&lt;&lt;interface&gt;&gt;'), 'grFilled') + rightArrow(8.2) + box('B', 9.5))
    expect(source).toContain('  n1["Chat #quot;demo#quot;<br>#lt;#lt;interface#gt;#gt;"]')
  })

  it('makes a labelled arrow pointing at a step a callout anchored at that step\'s text', () => {
    const { draft } = draftOf(TITLE + PIPELINE + PRUEBAS)
    expect(draft.blocks.some(b => b.kind === 'diagram')).toBe(true)
    expect(draft.callouts).toEqual([{ anchor: { kind: 'text', text: 'Requisitos' }, text: 'Pruebas', box: null, step: null }])
    expect(draft.losses).toEqual([])
    expect(renderDraftBody(draft, undefined).markdown).not.toContain('Pruebas')
  })

  it('doesn\'t use mermaid when a node callout\'s anchor text also appears in the slide\'s content', () => {
    const { draft } = draftOf(TITLE + body(list(item(p('Requisitos claros')))) + PIPELINE + PRUEBAS)
    expect(draft.blocks.some(b => b.kind === 'diagram')).toBe(false)
  })

  it.each([
    ['a line drawn across a box (a class compartment)', TITLE + PIPELINE + customShape('mso-spt32', { x: 1.8, y: 8.6, w: 6.2, h: 0.001 }, '', 'grBox')],
    ['edges along both axes', `${TITLE + box('A', 2, 5) + rightArrow(8.2, 5.7) + box('B', 9.5, 5)}${customShape('down-arrow', { x: 12, y: 7.2, w: 0.8, h: 1 }, '', 'grFilled')}${box('C', 9.5, 8.2)}`],
    ['overlapping boxes', TITLE + box('A', 2) + rightArrow(7.9) + box('B', 7.5)],
    ['an arrow leading nowhere', `${TITLE + PIPELINE}${line(20, 9.8, 20, 13)}`],
    ['a non-rectangular node', TITLE + customShape('hexagon', { x: 2, y: 7.6, w: 6.2, h: BOX_H }, p('A'), 'grFilled') + rightArrow(8.2) + box('B', 9.5)],
  ])('rejects %s', (_, inner) => {
    expect(mermaidOf(inner)).toBeUndefined()
  })
})

describe('mermaid placement', () => {
  it('splits the body at the empty paragraphs the drawing sits in', () => {
    const { draft } = draftOf(TITLE + body(p('Desarrollo con Pruebas al Final'), p('TLD (Test Last Development)'), p(''), p(''), p(''), p(''), list(item(p('uno')), item(p('dos')))) + PIPELINE)
    const markdown = renderDraftBody(draft, undefined).markdown
    expect(markdown.indexOf('TLD (Test Last Development)')).toBeLessThan(markdown.indexOf('```mermaid'))
    expect(markdown.indexOf('```mermaid')).toBeLessThan(markdown.indexOf('- uno'))
  })

  it('records where empty body paragraphs were removed', () => {
    const deck = deckOf([page(TITLE + body(p('Intro'), p('TLD'), p(''), p(''), list(item(p('uno')))))])
    const cs = classifySlide(deck.slides[0], deck)
    expect(cs.bodyGaps).toHaveLength(1)
    expect(cs.bodyGaps[0].index).toBe(2)
    // Below two 18pt lines of the body's top padding.
    expect(cs.bodyGaps[0].y).toBeCloseTo(4.125 + 2 * 18 * 1.17 * 2.54 / 72, 5)
  })

  it('puts a drawing below the body after the body\'s content', () => {
    const { draft } = draftOf(TITLE + frame('outline', { x: 1.2, y: 4, w: 23.4, h: 3 }, textBox(list(item(p('uno'))))) + PIPELINE.replace(/svg:y="7\.6cm"/g, 'svg:y="12cm"').replace(/svg:y="8\.375cm"/g, 'svg:y="12.7cm"'))
    const markdown = renderDraftBody(draft, undefined).markdown
    expect(markdown.indexOf('- uno')).toBeLessThan(markdown.indexOf('```mermaid'))
  })
})

describe('diagram groups', () => {
  function groupsOf(inner: string) {
    const deck = deckOf([page(inner)])
    const cs = classifySlide(deck.slides[0], deck)
    return diagramGroups(cs, annotateCodes(cs, bodyRegionFor(deck, cs.slide)))
  }

  it('leaves a caption beside a screenshot out', () => {
    expect(groupsOf(TITLE + image({ x: 4, y: 5, w: 10, h: 8 }, 'Pictures/shot.png') + customShape('mso-spt202', { x: 4, y: 13.05, w: 10, h: 1 }, p('Figura 1')))).toEqual([])
  })

  it('takes the labels written beside the shapes of a drawing with lines', () => {
    const [group] = groupsOf(TITLE
      + image({ x: 4, y: 5, w: 3, h: 3 }, 'Pictures/shot.png')
      + line(7.2, 6.5, 12, 6.5)
      + image({ x: 12.2, y: 5, w: 3, h: 3 }, 'Pictures/shot.png')
      + customShape('ooxml-rect', { x: 15.9, y: 5.5, w: 4, h: 1.2 }, p('Nodo #3') + p('Safari en Mac')))
    expect(group.members.map(m => m.kind === 'image' ? 'image' : shapeText(m).replace(/\n/g, ' ') || m.kind)).toEqual(expect.arrayContaining(['image', 'line', 'Nodo #3 Safari en Mac']))
    expect(group.labels.size).toBe(1)
  })

  it('drops a group reaching code', () => {
    const code = frame(null, { x: 2, y: 5, w: 10, h: 3 }, textBox(p('int x = 1;', 'Pmono'), p('return x;', 'Pmono')))
    expect(groupsOf(TITLE + code + box('A', 11.9, 5, 3) + box('B', 14.9, 5, 3))).toEqual([])
  })
})

describe('sVG candidates', () => {
  const SHOT = image({ x: 4, y: 5, w: 10, h: 8 }, 'Pictures/shot.png')
  // A label written on the picture (a callout on its own) plus a hexagon, which no callout can express.
  const OVERLAY = SHOT + customShape('hexagon', { x: 5, y: 6, w: 3, h: 3 }, '', 'grFilled') + customShape('ooxml-rect', { x: 7, y: 8, w: 4, h: 1 }, p('MODELO DE DOMINIO'))

  it('leaves a lossy image overlay out of the ordinary conversion when it can be embedded', () => {
    const { draft, ctx } = draftOf(TITLE + OVERLAY, { canEmbedDiagrams: true })
    expect(draft.diagramCandidates).toHaveLength(1)
    expect(draft.diagramCandidates[0].members).toHaveLength(3)
    expect(draft.images).toEqual([])
    expect(draft.callouts).toEqual([])
    expect(draft.losses).toEqual([])
    // Nothing registered for the picture that went into the diagram.
    expect(ctx.images.size).toBe(0)
  })

  it('keeps the ordinary conversion without LibreOffice, or on a hidden slide', () => {
    for (const draft of [draftOf(TITLE + OVERLAY).draft, draftOf(TITLE + OVERLAY, { canEmbedDiagrams: true, hidden: true }).draft]) {
      expect(draft.diagramCandidates).toEqual([])
      expect(draft.images).toHaveLength(1)
      expect(draft.callouts.map(c => c.text)).toEqual(['MODELO DE DOMINIO'])
      expect(draft.losses).toEqual(['decorative shape (hexagon) omitted'])
    }
  })

  it('keeps screenshot callouts that convert fully', () => {
    const { draft } = draftOf(TITLE + SHOT + line(9, 9, 16, 9) + customShape('ooxml-rect', { x: 16, y: 8.5, w: 6, h: 1.4 }, p('Le damos un nombre')), { canEmbedDiagrams: true })
    expect(draft.diagramCandidates).toEqual([])
    expect(draft.callouts).toHaveLength(1)
  })

  it('ignores a flattened side label and an empty frame around the picture when judging losses', () => {
    const { draft } = draftOf(TITLE
      + SHOT
      + customShape('rectangle', { x: 3.9, y: 4.9, w: 10.2, h: 8.2 }, '', 'grBox')
      + line(9, 9, 16, 9)
      + customShape('ooxml-rect', { x: 16, y: 8.5, w: 6, h: 1.4 }, p('Le damos un nombre'))
      + customShape('mso-spt202', { x: 4, y: 3.9, w: 5, h: 0.9 }, p('Implementación en Java')), { canEmbedDiagrams: true })
    expect(draft.diagramCandidates).toEqual([])
    expect(draft.callouts).toHaveLength(1)
  })
})

describe('diagrams in build-ups', () => {
  it('merges slides sharing a diagram when only a bullet is added', () => {
    const result = mergeBuildUps(draftsOf([
      page(TITLE + frame('outline', { x: 1.2, y: 11, w: 23.4, h: 6 }, textBox(list(item(p('uno'))))) + PIPELINE),
      page(TITLE + frame('outline', { x: 1.2, y: 11, w: 23.4, h: 6 }, textBox(list(item(p('uno')), item(p('dos'))))) + PIPELINE),
    ]))
    expect(result.drafts).toHaveLength(1)
    const markdown = renderDraftBody(result.drafts[0], undefined).markdown
    expect(markdown).toContain('```mermaid')
    expect(markdown).toContain('<v-click at="1">')
  })

  it('keeps slides separate when the diagram changes', () => {
    const result = mergeBuildUps(draftsOf([
      page(TITLE + PIPELINE),
      page(TITLE + PIPELINE + rightArrow(23.9) + box('Pruebas', 25.2, 7.6, 3)),
    ]))
    expect(result.drafts).toHaveLength(2)
    expect(result.warnings.join('\n')).toContain('kept as separate slides')
  })
})
