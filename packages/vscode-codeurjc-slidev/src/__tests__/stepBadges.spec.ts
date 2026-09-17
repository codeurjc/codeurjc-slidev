import { describe, expect, it } from 'vitest'
import { computeDocumentClicks } from '../clickModel'
import { computeStepHovers, formatStepBadge } from '../stepBadges'

describe('formatStepBadge', () => {
  it.each([
    [['2'], 3, true, '▸2 of 3'],
    [['2'], 3, false, '▸2'],
    [['1', '3'], 3, true, '▸1,3 of 3'],
    [['2-4'], 5, true, '▸2-4 of 5'],
    [['2'], null, true, '▸2'],
  ] as const)('%j with total %s (showTotal %s) reads %s', (steps, total, showTotal, text) => {
    expect(formatStepBadge([...steps], total, showTotal)).toBe(text)
  })
})

describe('computeStepHovers', () => {
  const HEAD = '---\ntheme: codeurjc-slidev-theme\n---\n'

  function hovers(body: string, showTotal = true) {
    const text = `${HEAD}${body}`
    const lines = text.split('\n')
    return computeStepHovers(computeDocumentClicks(text), showTotal).map(h => ({ text: lines[h.line], contents: h.contents }))
  }

  it('says at which click a marker and an anchor appear', () => {
    expect(hovers('```java\na(); // [!mark{2}] two\n```\n\n<<< @/code/Foo.java java\n[!mark:"float suma"{3}] Sums up')).toEqual([
      { text: 'a(); // [!mark{2}] two', contents: 'Highlight revealed at click 2 of 3' },
      { text: '[!mark:"float suma"{3}] Sums up', contents: 'Highlight revealed at click 3 of 3' },
    ])
  })

  it('omits the total when the setting is off', () => {
    expect(hovers('```java\na(); // [!mark{2}] two\n```', false)[0].contents).toBe('Highlight revealed at click 2')
  })

  it('names the uncountable source when the total is unknown', () => {
    expect(hovers('```java\na(); // [!mark{2}] two\n```\n\n<MyStepper />')[0].contents)
      .toBe('Highlight revealed at click 2 (the slide\'s total is unknown: <MyStepper> on line 8 may add clicks)')
  })

  it('explains a code block whose range clicks are unknown', () => {
    expect(hovers('<MyStepper />\n\n```ts {1|2}\na\nb\n```')).toEqual([
      { text: '```ts {1|2}', contents: 'This code block\'s range clicks are unknown: <MyStepper> on line 4 may add clicks' },
    ])
  })

  it('describes step ranges', () => {
    expect(hovers('```java\na(); // [!mark{2-4}] r\nb(); // [!mark{-1}] s\nc(); // [!mark{3-3}] t\n```')).toEqual([
      { text: 'a(); // [!mark{2-4}] r', contents: 'Highlight visible at clicks 2–4 of 5' },
      { text: 'b(); // [!mark{-1}] s', contents: 'Highlight visible until click 1 of 5' },
      { text: 'c(); // [!mark{3-3}] t', contents: 'Highlight visible at click 3 of 5' },
    ])
  })
})
