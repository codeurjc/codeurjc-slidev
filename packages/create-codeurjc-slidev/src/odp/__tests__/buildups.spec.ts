import type { DraftContext } from '../draft'
import { describe, expect, it } from 'vitest'
import { mergeBuildUps } from '../buildups'
import { classifySlide } from '../classify'
import { LINE_HEIGHT_FACTOR, PT_TO_CM } from '../constants'
import { draftSlide, renderDraftBody } from '../draft'
import { parseOdp } from '../parse'
import { buildOdp, customShape, frame, image, item, line, list, p, page, textBox, xmlEscape } from './odpFixture'

const TITLE = { x: 1.29, y: 1.7, w: 19.9, h: 2.8 }
const BODY = { x: 1.27, y: 4.457, w: 22.859, h: 11.048 }

function drafts(pages: string[]) {
  const deck = parseOdp(buildOdp({ pages, files: { 'Pictures/shot.png': new Uint8Array([1]), 'Pictures/other.png': new Uint8Array([2]) } }))
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

describe('mergeBuildUps: walk-throughs', () => {
  // A YAML workflow in a monospace box, as in the GitHub Actions decks; each
  // slide frames one line with a labeled highlight box.
  const YAML = ['name: CI', 'on:', '  push:', 'jobs:', '  test:', '    runs-on: ubuntu-latest']
  const CODE_RECT = { x: 0.556, y: 3.723, w: 24, h: 14 }
  const LH = 14 * LINE_HEIGHT_FACTOR * PT_TO_CM
  const top = (lineIndex: number) => CODE_RECT.y + 0.125 + lineIndex * LH
  const code = customShape('ooxml-rect', CODE_RECT, YAML.map(l => p(xmlEscape(l), 'Pmono')).join(''))
  const workflowTitle = frame('title', { x: 0.5, y: 1.3, w: 22, h: 1.8 }, textBox(p('Integración Continua')))
  const box = (lineIndex: number, label: string) =>
    customShape('ooxml-rect', { x: 0.556, y: top(lineIndex) - 0.05, w: 23.5, h: LH + 0.1 }, '', 'grBox')
    + customShape('ooxml-rect', { x: 18.5, y: top(lineIndex) + 0.02, w: 4, h: 0.5 }, p(label))
  const slide = (...boxes: string[]) => page(workflowTitle + code + boxes.join(''))
  const markdown = (result: ReturnType<typeof mergeBuildUps>, index = 0) => renderDraftBody(result.drafts[index], undefined).markdown

  it('turns a highlight moving line by line into step ranges', () => {
    const result = mergeBuildUps(drafts([slide(box(1, 'ON')), slide(box(2, 'PUSH')), slide(box(4, 'TEST'))]))
    expect(result.warnings).toEqual([])
    expect(result.drafts).toHaveLength(1)
    expect(result.drafts[0].odpNumbers).toEqual([1, 2, 3])
    const md = markdown(result)
    expect(md).toContain('on: # [!mark{-0}] ON')
    expect(md).toContain('push: # [!mark{1-1}] PUSH')
    expect(md).toContain('test: # [!mark{2}] TEST')
  })

  it('keeps a highlight shown on every slide unstepped and moves another one', () => {
    const result = mergeBuildUps(drafts([slide(box(0, 'NAME'), box(1, 'ON')), slide(box(0, 'NAME'), box(4, 'TEST'))]))
    const md = markdown(result)
    expect(md).toContain('name: CI # [!mark] NAME')
    expect(md).toContain('on: # [!mark{-0}] ON')
    expect(md).toContain('test: # [!mark{1}] TEST')
  })

  it('stops the run where a removed highlight comes back, with a warning', () => {
    const result = mergeBuildUps(drafts([slide(box(1, 'ON')), slide(box(2, 'PUSH')), slide(box(1, 'ON'))]))
    expect(result.drafts.map(d => d.odpNumbers)).toEqual([[1, 2], [3]])
    expect(result.warnings).toEqual(['Build-up of ODP slides 2–3 kept as separate slides (can\'t convert to click steps: highlight shown again after being removed)'])
  })

  it('warns about a swapped screenshot instead of skipping it silently', () => {
    const text = frame('outline', BODY, textBox(list(item(p('uno')))))
    const result = mergeBuildUps(drafts([
      page(title + text + image({ x: 12, y: 6, w: 8, h: 6 }, 'Pictures/shot.png')),
      page(title + text + image({ x: 12, y: 6, w: 8, h: 6 }, 'Pictures/other.png')),
    ]))
    expect(result.drafts).toHaveLength(2)
    expect(result.warnings).toEqual(['Build-up of ODP slides 1–2 kept as separate slides (can\'t convert to click steps: image removed)'])
  })

  it('says nothing about same-title slides that simply show different content', () => {
    const result = mergeBuildUps(drafts([
      page(title + frame('outline', BODY, textBox(list(item(p('uno')), item(p('dos')))))),
      page(title + customShape('rectangle', { x: 2, y: 6, w: 10, h: 3 }, p('Otra cosa'), 'grBox')),
    ]))
    expect(result.drafts).toHaveLength(2)
    expect(result.warnings).toEqual([])
  })
})
