import { describe, expect, it } from 'vitest'
import { computeDocumentClicks } from '../clickModel'

const HEAD = '---\ntheme: codeurjc-slidev-theme\n---\n'
const FENCE = '```'

/** The clicks of a one-slide deck built from `body` (lines after the headmatter). */
function slide(body: string, frontmatter = '') {
  const text = frontmatter ? `---\ntheme: codeurjc-slidev-theme\n${frontmatter}\n---\n${body}` : `${HEAD}${body}`
  return computeDocumentClicks(text)[0]
}

function lineOf(body: string, needle: string, frontmatter = ''): number {
  const text = frontmatter ? `---\ntheme: codeurjc-slidev-theme\n${frontmatter}\n---\n${body}` : `${HEAD}${body}`
  return text.split('\n').findIndex(l => l.includes(needle))
}

describe('computeDocumentClicks: recognised sources', () => {
  it.each([
    ['no click sources', '# Plain\n\ntext', 0],
    ['one v-click attribute', '<div v-click>a</div>', 1],
    ['v-click with a relative string', `<div v-click="'+2'">a</div>`, 2],
    ['v-click with an absolute number', '<div v-click="4">a</div>', 4],
    ['v-click with a bare +N (evaluates to a number)', '<div v-click="+3">a</div>', 3],
    ['v-click range', '<div v-click="[2, 4]">a</div>', 4],
    ['v-click.hide and v-click-hide', '<div v-click.hide>a</div>\n<div v-click-hide>b</div>', 2],
    ['v-after adds no click', '<div v-click>a</div>\n<div v-after>b</div>', 1],
    ['v-click component', '<v-click>\n\na\n\n</v-click>\n<v-click>b</v-click>', 2],
    ['VClick component with at', '<VClick at="3">a</VClick>', 3],
    ['v-clicks over a list', '<v-clicks>\n\n- a\n- b\n- c\n\n</v-clicks>', 3],
    ['v-clicks every 2', '<v-clicks every="2">\n\n- a\n- b\n- c\n\n</v-clicks>', 2],
    ['v-clicks depth 2', '<v-clicks depth="2">\n\n- a\n  - a1\n  - a2\n- b\n\n</v-clicks>', 4],
    ['v-clicks depth 1 skips nested items', '<v-clicks>\n\n- a\n  - a1\n- b\n\n</v-clicks>', 2],
    // VClickGap reaches offset + size - 1 on its own.
    ['v-click-gap', '<v-click-gap size="3" />\n<div v-click>a</div>', 4],
    ['fence ranges', `${FENCE}ts {1|3|5}\na\nb\nc\nd\ne\n${FENCE}`, 2],
    ['single fence range adds no click', `${FENCE}ts {2}\na\nb\n${FENCE}`, 0],
    ['fence ranges with a numeric at', `${FENCE}ts {1|2|3} {at: 5}\na\nb\nc\n${FENCE}`, 6],
    ['theme marker step', `${FENCE}java\nint a; // [!mark{3}] note\n${FENCE}`, 3],
    ['theme marker step range adds its disappearance click', `${FENCE}java\nint a; // [!mark{1-2}] note\n${FENCE}`, 3],
    ['walk-through', `${FENCE}java\nint a; // [!mark{-0}] a\nint b; // [!mark{1-1}] b\nint c; // [!mark{2}] c\n${FENCE}`, 2],
    ['anchor step range', '<<< @/code/Foo.java java\n[!mark:1{-1}] note', 2],
    ['anchor step', '<<< @/code/Foo.java java\n[!mark:1{2}] note', 2],
    ['comments are ignored', '<!-- <div v-click>a</div> -->\n<div v-click>b</div>', 1],
    ['inline code is ignored', '`<div v-click>`\n\ntext', 0],
    ['mermaid fences have no ranges', `${FENCE}mermaid {theme: 'neutral'}\ngraph LR\n${FENCE}`, 0],
  ])('%s', (_name, body, total) => {
    const clicks = slide(body)
    expect(clicks.uncountable).toEqual([])
    expect(clicks.total).toBe(total)
  })

  it('counts slide callout steps from block and flow frontmatter', () => {
    expect(slide('text', 'callouts:\n  - at: {x: 1, y: 1}\n    step: 3\n  - at: {x: 2, y: 2}')).toMatchObject({ total: 3, uncountable: [] })
    expect(slide('text', 'callouts: [{at: {x: 1, y: 1}, step: 2}]\ngeometry:\n  step: 9').total).toBe(2)
  })

  it('counts slide callout step ranges', () => {
    expect(slide('text', 'callouts:\n  - at: {x: 1, y: 1}\n    step: 2-4\n  - at: {x: 2, y: 2}\n    step: -0')).toMatchObject({ total: 5 })
    expect(slide('text', 'callouts: [{at: {x: 1, y: 1}, step: "-1"}]').total).toBe(2)
  })

  it('ignores callout steps off the default layout', () => {
    expect(slide('text', 'layout: cover\ncallouts:\n  - at: {x: 1, y: 1}\n    step: 3').total).toBe(0)
  })

  it('frontmatter clicks overrides the total', () => {
    expect(slide('<div v-click>a</div>', 'clicks: 7').total).toBe(7)
  })

  it('frontmatter clicks gives a total even when uncountable', () => {
    expect(slide('<MyStepper />', 'clicks: 5').total).toBe(5)
  })
})

describe('computeDocumentClicks: ordering', () => {
  it('starts fence ranges after earlier relative clicks', () => {
    const body = `<div v-click>one</div>\n\n${FENCE}ts {1|3|5}\na\nb\nc\nd\ne\n${FENCE}`
    const clicks = slide(body)
    const fence = clicks.registrations.find(r => r.kind === 'fence-range')!
    expect(fence.segments!.map(s => s.click)).toEqual([2, 3])
    expect(clicks.total).toBe(3)
  })

  it('absolute markers do not shift later relative sources', () => {
    const body = `${FENCE}java\nint a; // [!mark{4}] note\n${FENCE}\n\n${FENCE}ts {1|2}\na\nb\n${FENCE}`
    const clicks = slide(body)
    const fence = clicks.registrations.find(r => r.kind === 'fence-range')!
    expect(fence.segments!.map(s => s.click)).toEqual([1])
    expect(clicks.total).toBe(4)
  })

  it('a numeric at ignores earlier clicks', () => {
    const body = `<div v-click>a</div>\n\n${FENCE}ts {1|2|3} {at: 5}\na\nb\nc\n${FENCE}`
    expect(slide(body).registrations.find(r => r.kind === 'fence-range')!.segments!.map(s => s.click)).toEqual([5, 6])
  })

  it('an element registers after the click sources inside it', () => {
    const body = `<div v-click="'+2'">\n\n${FENCE}ts {1|2}\na\nb\n${FENCE}\n\n</div>`
    const clicks = slide(body)
    expect(clicks.registrations.map(r => r.kind)).toEqual(['fence-range', 'v-click'])
    expect(clicks.registrations[0].segments![0].click).toBe(1)
    expect(clicks.total).toBe(3)
  })

  it('places segment badges on the first line of each range, and all on the opening line', () => {
    const body = `${FENCE}ts {2|4-5|all}\nl1\nl2\nl3\nl4\nl5\n${FENCE}`
    const fence = slide(body).registrations.find(r => r.kind === 'fence-range')!
    expect(fence.segments).toEqual([
      { line: lineOf(body, 'l4'), click: 1 },
      { line: lineOf(body, 'ts {2|4-5|all}'), click: 2 },
    ])
  })

  it('counts rendered lines, skipping an inline source marker line', () => {
    const body = `${FENCE}ts {1|2}\n// [!source https://github.com/o/r]\nl1\nl2\n${FENCE}`
    const fence = slide(body).registrations.find(r => r.kind === 'fence-range')!
    expect(fence.segments![0].line).toBe(lineOf(body, 'l2'))
  })

  it('applies startLine to range numbers', () => {
    const body = `${FENCE}ts {10|12} {startLine: 10}\nl10\nl11\nl12\n${FENCE}`
    const fence = slide(body).registrations.find(r => r.kind === 'fence-range')!
    expect(fence.segments![0].line).toBe(lineOf(body, 'l12'))
  })

  it('reads a marker line and a range marker on its start line', () => {
    const body = `${FENCE}java\na(); // [!mark:start{3}] range\nb();\nc(); // [!mark:end]\nd(); // [!mark{1}] one\n${FENCE}`
    const markers = slide(body).registrations.filter(r => r.kind === 'marker')
    expect(markers.map(m => [m.line, m.start])).toEqual([[lineOf(body, 'a();'), 3], [lineOf(body, 'd();'), 1]])
  })

  it('keeps slides apart, including slides with their own frontmatter', () => {
    const text = `${HEAD}\n<div v-click>a</div>\n\n---\nlayout: default\n---\n\n<div v-click>b</div>\n<div v-click>c</div>\n\n---\n\nplain\n`
    expect(computeDocumentClicks(text).map(s => s.total)).toEqual([1, 2, 0])
  })
})

describe('computeDocumentClicks: uncountable sources', () => {
  it.each([
    ['a custom PascalCase component', '<MyStepper />'],
    ['a bound v-click value', '<div v-click="step">a</div>'],
    ['v-switch', '<v-switch>\n<template #1>a</template>\n</v-switch>'],
    ['v-mark', '<span v-mark.red="1">a</span>'],
    ['v-motion', '<div v-motion :click-1="{ x: 0 }">a</div>'],
    ['magic-move', '````md magic-move\n```ts\na\n```\n```ts\nb\n```\n````'],
    ['v-clicks around something other than a list', '<v-clicks>\n\nparagraph\n\n</v-clicks>'],
    ['a v-click containing another source', '<v-click>\n\n<div v-click>a</div>\n\n</v-click>'],
    ['a bound at on v-clicks', '<v-clicks :at="n">\n\n- a\n\n</v-clicks>'],
    ['an MDC v-click attribute', '- item {v-click}'],
    ['KaTeX line ranges', '$$ {1|2}\na \\\\\nb\n$$'],
  ])('%s', (_name, body) => {
    const clicks = slide(body)
    expect(clicks.uncountable.length).toBeGreaterThan(0)
    expect(clicks.total).toBeNull()
  })

  it('treats a kebab-case tag as click-free unless the project defines that component', () => {
    expect(slide('<carbon-arrow-right />').total).toBe(0)
    const text = `${HEAD}<my-stepper />`
    const [clicks] = computeDocumentClicks(text, { componentNames: new Set(['MyStepper', 'my-stepper']) })
    expect(clicks.total).toBeNull()
    expect(clicks.uncountable[0].source).toBe('<my-stepper>')
  })

  it('keeps click-free built-ins countable', () => {
    expect(slide('<Tweet id="1" />\n<Youtube id="x" />\n<div v-click>a</div>').total).toBe(1)
  })

  it('keeps absolute steps and earlier relative ones exact, but not later relative ones', () => {
    const body = `${FENCE}ts {1|3}\na\nb\nc\n${FENCE}\n\n<MyStepper />\n\n${FENCE}java {1|2}\nint a; // [!mark{2}] note\nint b;\n${FENCE}`
    const clicks = slide(body)
    const [before, marker, after] = clicks.registrations
    expect(before.kind).toBe('fence-range')
    expect(before.segments![0].click).toBe(1)
    expect(marker).toMatchObject({ kind: 'marker', start: 2, exact: true })
    expect(after).toMatchObject({ kind: 'fence-range', exact: false })
    expect(after.segments![0].click).toBeNull()
    expect(clicks.total).toBeNull()
    expect(clicks.uncountable).toEqual([{ line: lineOf(body, '<MyStepper />'), source: '<MyStepper>' }])
  })
})

describe('computeDocumentClicks: anchors with a resolver', () => {
  const body = '<<< @/code/Foo.java java\n[!mark:"missing"{3}] gone\n[!mark:"getNotas"{2}] found'
  const fileText = 'class Foo {\n  getNotas();\n}'

  it('registers only anchors that resolve against the imported file', () => {
    const [clicks] = computeDocumentClicks(`${HEAD}${body}`, { resolveImportText: () => fileText })
    expect(clicks.registrations.map(r => r.start)).toEqual([2])
    expect(clicks.total).toBe(2)
  })

  it('registers nothing when the import does not resolve', () => {
    const [clicks] = computeDocumentClicks(`${HEAD}${body}`, { resolveImportText: () => null })
    expect(clicks.total).toBe(0)
  })
})
