import { describe, expect, it } from 'vitest'
import { splitSlides } from '../../documentScan'
import { collectSlideCandidates } from '../candidates'
import { hasExternalContent, slideIncludeSrc } from '../slideIncludes'

function candidatesOf(text: string, slideNo = 1) {
  const slide = splitSlides(text).find(s => s.no === slideNo)!
  return collectSlideCandidates(text, slide)
}

describe('collectSlideCandidates', () => {
  it('reads a fence id only when it is quoted', () => {
    const { candidates } = candidatesOf([
      '```mermaid {id: \'flow\'}',
      'flowchart LR',
      '```',
      '',
      '```mermaid {id: bare}',
      'flowchart TB',
      '```',
    ].join('\n'))
    expect(candidates).toEqual([
      { kind: 'mermaid', id: 'flow', wrapperId: undefined },
      { kind: 'mermaid', id: undefined, wrapperId: undefined },
    ])
  })

  it('reads a fence title', () => {
    const { candidates } = candidatesOf('```ts [Test.java]\nconst a = 1\n```')
    expect(candidates).toEqual([{ kind: 'code', id: undefined, title: 'Test.java', wrapperId: undefined }])
  })

  it('reads a `<<<` import by its path as written', () => {
    const { candidates } = candidatesOf('<<< @/code/ejem1/Calculadora.java[7-24] java')
    expect(candidates).toEqual([{ kind: 'code', importPath: '@/code/ejem1/Calculadora.java', wrapperId: undefined }])
  })

  it('groups by kind the way the layout does, not in document order', () => {
    // The layout collects every code wrapper, then every mermaid, then every
    // table -- so a table written first still comes last.
    const { candidates } = candidatesOf([
      '| a | b |',
      '|---|---|',
      '| 1 | 2 |',
      '',
      '```mermaid',
      'flowchart LR',
      '```',
      '',
      '```ts',
      'const a = 1',
      '```',
    ].join('\n'))
    expect(candidates.map(c => c.kind)).toEqual(['code', 'mermaid', 'table'])
  })

  it('orders code blocks and imports together by document line', () => {
    const { candidates } = candidatesOf([
      '```ts [first.ts]',
      'const a = 1',
      '```',
      '',
      '<<< @/code/Second.java java',
      '',
      '```ts [third.ts]',
      'const b = 2',
      '```',
    ].join('\n'))
    expect(candidates.map(c => c.title ?? c.importPath)).toEqual(['first.ts', '@/code/Second.java', 'third.ts'])
  })

  it('skips fences that Slidev does not wrap in a code wrapper', () => {
    const { candidates } = candidatesOf([
      '```ts {monaco}',
      'const a = 1',
      '```',
      '',
      '````md magic-move',
      '```ts',
      'const b = 2',
      '```',
      '````',
      '',
      '```plantuml',
      '@startuml',
      '```',
    ].join('\n'))
    expect(candidates).toEqual([])
  })

  it('attaches a wrapper id to a wrapped table', () => {
    const { candidates } = candidatesOf([
      '<div id="prices">',
      '',
      '| a | b |',
      '|---|---|',
      '| 1 | 2 |',
      '',
      '</div>',
    ].join('\n'))
    expect(candidates).toEqual([{ kind: 'table', wrapperId: 'prices' }])
  })

  it('attaches a wrapper id to a wrapped import', () => {
    const { candidates } = candidatesOf([
      '<div id="snippet">',
      '<<< @/code/A.java java',
      '</div>',
    ].join('\n'))
    expect(candidates).toEqual([{ kind: 'code', importPath: '@/code/A.java', wrapperId: 'snippet' }])
  })

  it('does not attach a wrapper id when the div wraps more than one element', () => {
    const { candidates } = candidatesOf([
      '<div id="both">',
      '<<< @/code/A.java java',
      '<<< @/code/B.java java',
      '</div>',
    ].join('\n'))
    expect(candidates.every(c => c.wrapperId === undefined)).toBe(true)
  })

  it('collects authored image srcs in document order, markdown and html alike', () => {
    const { srcs } = candidatesOf([
      '![](/images/a.png)',
      '<img src="/images/b.png">',
      '![alt](/images/a.png)',
    ].join('\n'))
    expect(srcs).toEqual(['/images/a.png', '/images/b.png', '/images/a.png'])
  })

  it('ignores images written inside a fenced code block', () => {
    const { srcs } = candidatesOf([
      '```md',
      '![](/images/not-content.png)',
      '```',
      '![](/images/real.png)',
    ].join('\n'))
    expect(srcs).toEqual(['/images/real.png'])
  })

  it('collects ids of every kind, so a wrong-kind id can be told from a missing one', () => {
    const { otherIds } = candidatesOf([
      '```mermaid {id: \'flow\'}',
      'flowchart LR',
      '```',
      '',
      '<p id="prose">text</p>',
    ].join('\n'))
    expect(otherIds).toEqual(new Set(['flow', 'prose']))
  })

  it('scopes everything to its own slide', () => {
    const text = [
      '---',
      'layout: default',
      '---',
      '',
      '```ts [one.ts]',
      'const a = 1',
      '```',
      '',
      '---',
      '',
      '```ts [two.ts]',
      'const b = 2',
      '```',
    ].join('\n')
    expect(candidatesOf(text, 1).candidates.map(c => c.title)).toEqual(['one.ts'])
    expect(candidatesOf(text, 2).candidates.map(c => c.title)).toEqual(['two.ts'])
  })

  it('reports the document line each candidate and image starts on', () => {
    const { candidateLines, imageLines } = candidatesOf([
      '![](/images/a.png)',
      '',
      '```ts [one.ts]',
      'const a = 1',
      '```',
    ].join('\n'))
    expect(imageLines).toEqual([0])
    expect(candidateLines).toEqual([2])
  })
})

describe('slideIncludeSrc', () => {
  const slideWith = (frontmatter: string) => splitSlides(`---\n${frontmatter}\n---\n\ncontent\n`)[0]

  it('detects a slide whose content comes from another file', () => {
    expect(slideIncludeSrc(slideWith('src: ./other.md'))).toBe('./other.md')
    expect(hasExternalContent(slideWith('src: ./other.md'))).toBe(true)
  })

  it('unquotes the value', () => {
    expect(slideIncludeSrc(slideWith('src: \'./other.md\''))).toBe('./other.md')
  })

  it('is null for an ordinary slide', () => {
    expect(slideIncludeSrc(slideWith('layout: default'))).toBeNull()
    expect(hasExternalContent(slideWith('layout: default'))).toBe(false)
  })

  it('does not mistake a geometry image src for a slide include', () => {
    const slide = slideWith(['geometry:', '  images:', '    - {src: /images/a.png, x: 1, y: 2, w: 3, h: 4}'].join('\n'))
    expect(slideIncludeSrc(slide)).toBeNull()
  })
})
