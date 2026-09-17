import type { SlideDraft } from '../draft'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { convertOdp } from '../convert'
import { gridColumnsClass, layoutDraft, sideBySide } from '../grid'
import { buildOdp, customShape, frame, image, item, list, p, page, textBox, xmlEscape } from './odpFixture'

const TITLE = { x: 1.29, y: 1.7, w: 19.9, h: 2.8 }

function code(r: { x: number, y: number, w: number, h: number }, lines: string[]): string {
  return customShape('ooxml-rect', r, lines.map(l => p(xmlEscape(l), 'Pmono')).join(''))
}

const LEFT = ['public class MotorCar {', '    void start() {}', '}']
const RIGHT = ['public class ElectricCar {', '    void start() {}', '}']

const PAGES = [
  // Code beside code.
  page([
    frame('title', TITLE, textBox(p('Code and code'))),
    code({ x: 1, y: 5, w: 12, h: 6 }, LEFT),
    code({ x: 13.5, y: 5, w: 11, h: 6 }, RIGHT),
  ].join(''), { name: 'page1' }),
  // Code beside an image.
  page([
    frame('title', TITLE, textBox(p('Code and image'))),
    code({ x: 1, y: 5, w: 16, h: 8 }, LEFT),
    image({ x: 18, y: 5, w: 6, h: 6 }, 'Pictures/car.png'),
  ].join(''), { name: 'page2' }),
  // Body text beside code.
  page([
    frame('title', TITLE, textBox(p('Text and code'))),
    frame('outline', { x: 1.27, y: 4.5, w: 11, h: 8 }, textBox(list(item(p('Create the browser once'))))),
    code({ x: 13, y: 4.5, w: 11, h: 8 }, RIGHT),
  ].join(''), { name: 'page3' }),
  // Code above the body text: no grid.
  page([
    frame('title', TITLE, textBox(p('Code above text'))),
    code({ x: 1, y: 4.5, w: 20, h: 4 }, LEFT),
    frame('outline', { x: 1.27, y: 10, w: 22, h: 5 }, textBox(list(item(p('Explains the code'))))),
  ].join(''), { name: 'page4' }),
  // A build-up adding an image beside the code: the merged slide still gets the grid.
  page([
    frame('title', TITLE, textBox(p('Build-up'))),
    code({ x: 1, y: 5, w: 16, h: 8 }, LEFT),
  ].join(''), { name: 'page5' }),
  page([
    frame('title', TITLE, textBox(p('Build-up'))),
    code({ x: 1, y: 5, w: 16, h: 8 }, LEFT),
    image({ x: 18, y: 5, w: 6, h: 6 }, 'Pictures/car.png'),
  ].join(''), { name: 'page6' }),
]

let dir: string
let odpPath: string

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'odp-grid-'))
  odpPath = join(dir, 'Deck.odp')
  writeFileSync(odpPath, buildOdp({ pages: PAGES, files: { 'Pictures/car.png': new Uint8Array([137, 80]) } }))
})

afterAll(() => rmSync(dir, { recursive: true, force: true }))

describe('side-by-side grids', () => {
  it('sideBySide needs no horizontal overlap and a shared height', () => {
    expect(sideBySide({ x: 0, y: 0, w: 10, h: 6 }, { x: 10.2, y: 1, w: 5, h: 4 })).toBe(true)
    // A small overlap of the frames is tolerated.
    expect(sideBySide({ x: 0, y: 0, w: 10, h: 6 }, { x: 9.8, y: 1, w: 5, h: 4 })).toBe(true)
    expect(sideBySide({ x: 0, y: 0, w: 10, h: 6 }, { x: 5, y: 1, w: 10, h: 4 })).toBe(false)
    // Barely touching vertically.
    expect(sideBySide({ x: 0, y: 0, w: 10, h: 6 }, { x: 11, y: 5.5, w: 5, h: 4 })).toBe(false)
  })

  it('gridColumnsClass rounds widths to 0.5 cm and reduces the ratio', () => {
    expect(gridColumnsClass([{ width: 12, items: [] }, { width: 12.1, items: [] }])).toBe('grid-cols-2')
    expect(gridColumnsClass([{ width: 12, items: [] }, { width: 8, items: [] }])).toBe('grid-cols-[3fr_2fr]')
    expect(gridColumnsClass([{ width: 11.5, items: [] }, { width: 5, items: [] }])).toBe('grid-cols-[23fr_10fr]')
  })

  it('stacks items that share a column', () => {
    const block = (y: number) => ({ kind: 'markdown' as const, y, markdown: '' })
    const draft = {
      blocks: [],
      images: [],
      classified: {},
    } as unknown as SlideDraft
    const codeAt = (x: number, y: number, w: number, h: number) => ({ kind: 'code' as const, y, code: { shape: { rect: { x, y, w, h } } } })
    const top = codeAt(1, 5, 10, 4)
    const bottom = codeAt(1, 10, 10, 4)
    draft.blocks = [top, bottom, block(20)] as unknown as SlideDraft['blocks']
    draft.images = [{ key: 'a', publicPath: 'images/a.png', rect: { x: 0, y: 0, w: 1, h: 1 }, odpRect: { x: 12, y: 5, w: 10, h: 9 } }]
    const layout = layoutDraft(draft)
    expect(layout.grids).toHaveLength(1)
    expect(layout.grids[0].columns.map(c => c.items.length)).toEqual([2, 1])
    expect(layout.grids[0].columns[0].items.map(i => i.kind === 'block' && i.block)).toEqual([top, bottom])
    expect(layout.gridImages.has(draft.images[0])).toBe(true)
    expect(layout.bodyInGrid).toBe(false)
  })

  it('lays out code beside code, an image or the body as grid columns', async () => {
    const { slideSources } = await convertOdp({ odpPath, office: false, git: () => null })
    const [codeCode, codeImage, textCode, codeAbove] = slideSources

    expect(codeCode).toContain('<div class="grid grid-cols-[12fr_11fr] gap-6">\n<div class="min-w-0">\n\n```java\npublic class MotorCar {')
    expect(codeCode).toContain('```\n\n</div>\n<div class="min-w-0">\n\n```java\npublic class ElectricCar {')
    expect(codeCode).toMatch(/```\n\n<\/div>\n<\/div>\n$/)

    // The image is a grid column, not a positioned geometry entry.
    expect(codeImage).toContain('<div class="grid grid-cols-[8fr_3fr] gap-6">')
    expect(codeImage).toContain('<div class="min-w-0">\n\n![](/images/car.png)\n\n</div>\n</div>')
    expect(codeImage).not.toContain('geometry')

    // The body is a grid column, so the slide gets no content box.
    expect(textCode).toContain('<div class="grid grid-cols-2 gap-6">\n<div class="min-w-0">\n\n- Create the browser once\n\n</div>')
    expect(textCode).not.toContain('geometry')

    expect(codeAbove).not.toContain('grid')
    expect(codeAbove.indexOf('```java')).toBeLessThan(codeAbove.indexOf('- Explains the code'))

    expect(slideSources).toHaveLength(5)
    expect(slideSources[4]).toContain('<div class="grid grid-cols-[8fr_3fr] gap-6">')
    expect(slideSources[4]).toContain('<div class="min-w-0">\n\n<img v-click="1" src="/images/car.png">\n\n</div>\n</div>')
    expect(slideSources[4]).not.toContain('geometry')
  })
})
