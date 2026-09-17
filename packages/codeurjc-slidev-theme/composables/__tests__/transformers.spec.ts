import { describe, expect, it } from 'vitest'
import { slideCalloutStepBlock, wrapCodeBlock } from '../../setup/transformers'
import { parseFenceInfo } from '../fenceInfo'

describe('parseFenceInfo', () => {
  it('splits language, title, ranges, options and the rest like Slidev', () => {
    expect(parseFenceInfo('ts [app.ts] {1|3-4|all} {at: 3, lines: true} twoslash')).toEqual({
      lang: 'ts',
      title: 'app.ts',
      ranges: ['1', '3-4', 'all'],
      options: '{at: 3, lines: true}',
      rest: ' twoslash',
    })
  })

  it('has no ranges or options for a plain fence', () => {
    expect(parseFenceInfo('java')).toEqual({ lang: 'java', title: '', ranges: [], options: undefined, rest: '' })
  })

  it('reads ranges without a title', () => {
    expect(parseFenceInfo('py {2|4}').ranges).toEqual(['2', '4'])
  })
})

describe('wrapCodeBlock', () => {
  it('forwards native ranges and options to CodeBlockWrapper', () => {
    const out = wrapCodeBlock('ts [a.ts] {1|3} {at: 2}', '<pre>x</pre>', null, [4])
    expect(out).toContain('<CodeBlockWrapper v-bind="{at: 2}" title="a.ts" :ranges=\'["1","3"]\'>')
    expect(out).toContain('<span v-click="4"')
  })

  it('keeps an empty ranges list and no options for a plain marked fence', () => {
    expect(wrapCodeBlock('java', '<pre>x</pre>', null)).toBe('<CodeBlockWrapper title="" :ranges=\'[]\'><pre>x</pre></CodeBlockWrapper>')
  })

  it('keeps ranges alongside a source link', () => {
    const out = wrapCodeBlock('ts [a.ts] {2|3}', '<pre>x</pre>', { url: 'https://github.com/o/r', bottom: false })
    expect(out).toMatch(/^<CodeBlockWrapper title="a.ts" :ranges='\["2","3"\]' data-source-link-url="https:\/\/github.com\/o\/r" data-source-link-placement="title">/)
  })
})

describe('slideCalloutStepBlock', () => {
  it('registers each distinct callout step once, in a hidden block', () => {
    const block = slideCalloutStepBlock({
      callouts: [
        { at: { x: 1, y: 1 }, step: 2 },
        { at: { x: 2, y: 2 } },
        { at: { x: 3, y: 3 }, step: 1 },
        { at: { x: 4, y: 4 }, step: 2 },
      ],
    })
    expect(block).toBe('\n\n<div class="slide-callout-steps" aria-hidden="true" hidden><span v-click="1" class="code-callout-step" data-click-step="1" aria-hidden="true"></span><span v-click="2" class="code-callout-step" data-click-step="2" aria-hidden="true"></span></div>\n')
  })

  it('is empty without stepped callouts, for invalid entries, and off the default layout', () => {
    expect(slideCalloutStepBlock({})).toBe('')
    expect(slideCalloutStepBlock({ callouts: [{ at: { x: 1, y: 1 } }] })).toBe('')
    expect(slideCalloutStepBlock({ callouts: [{ at: 'nowhere', step: 2 }] })).toBe('')
    expect(slideCalloutStepBlock({ layout: 'cover', callouts: [{ at: { x: 1, y: 1 }, step: 2 }] })).toBe('')
  })
})
