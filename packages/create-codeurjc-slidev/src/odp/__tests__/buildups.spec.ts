import type { DraftContext } from '../draft'
import { describe, expect, it } from 'vitest'
import { mergeBuildUps } from '../buildups'
import { classifySlide } from '../classify'
import { draftSlide, renderDraftBody } from '../draft'
import { parseOdp } from '../parse'
import { buildOdp, customShape, frame, image, item, line, list, p, page, textBox } from './odpFixture'

const TITLE = { x: 1.29, y: 1.7, w: 19.9, h: 2.8 }
const BODY = { x: 1.27, y: 4.457, w: 22.859, h: 11.048 }

function drafts(pages: string[]) {
  const deck = parseOdp(buildOdp({ pages, files: { 'Pictures/shot.png': new Uint8Array([1]) } }))
  const ctx: DraftContext = { deck, codeIndex: [], images: new Map(), imagePaths: new Map() }
  return deck.slides.map(s => draftSlide(classifySlide(s, deck), ctx))
}

const title = frame('title', TITLE, textBox(p('Docker')))

describe('mergeBuildUps', () => {
  it('merges trailing list items into v-click steps', () => {
    const result = mergeBuildUps(drafts([
      page(title + frame('outline', BODY, textBox(list(item(p('uno')), item(p('dos')))))),
      page(title + frame('outline', BODY, textBox(list(item(p('uno')), item(p('dos')), item(p('tres')))))),
      page(title + frame('outline', BODY, textBox(list(item(p('uno')), item(p('dos')), item(p('tres')), item(p('cuatro')))))),
    ]))
    expect(result.mergedRuns).toBe(1)
    expect(result.drafts).toHaveLength(1)
    expect(result.drafts[0].odpNumbers).toEqual([1, 2, 3])
    expect(renderDraftBody(result.drafts[0], undefined).markdown).toBe([
      '- uno',
      '- dos',
      '',
      '<v-click at="1">',
      '',
      '- tres',
      '',
      '</v-click>',
      '',
      '<v-click at="2">',
      '',
      '- cuatro',
      '',
      '</v-click>',
    ].join('\n'))
  })

  it('merges an added image into a v-click image', () => {
    const result = mergeBuildUps(drafts([
      page(title + frame('outline', BODY, textBox(list(item(p('uno')))))),
      page(title + frame('outline', BODY, textBox(list(item(p('uno'))))) + image({ x: 12, y: 6, w: 8, h: 6 }, 'Pictures/shot.png')),
    ]))
    expect(result.drafts).toHaveLength(1)
    expect(renderDraftBody(result.drafts[0], undefined).markdown).toContain('<img v-click="1" src="/images/shot.png">')
  })

  it('keeps a screenshot build-up with an added arrow callout as separate slides, with a warning', () => {
    const shot = image({ x: 1, y: 4, w: 20, h: 12 }, 'Pictures/shot.png')
    const result = mergeBuildUps(drafts([
      page(title + shot),
      page(title + shot + line(12, 10, 16, 6) + customShape('ooxml-rect', { x: 16, y: 5, w: 6, h: 1 }, p('Nombre de la app'), 'grBox')),
    ]))
    expect(result.drafts).toHaveLength(2)
    expect(result.warnings).toEqual(['Build-up of ODP slides 1–2 kept as separate slides (can\'t convert to click steps: arrow, text box)'])
  })

  it('does not merge slides with different titles', () => {
    const result = mergeBuildUps(drafts([
      page(title + frame('outline', BODY, textBox(list(item(p('uno')))))),
      page(frame('title', TITLE, textBox(p('Otra'))) + frame('outline', BODY, textBox(list(item(p('uno')), item(p('dos')))))),
    ]))
    expect(result.drafts).toHaveLength(2)
    expect(result.warnings).toEqual([])
  })
})
