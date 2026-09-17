import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { computeDocumentClicks } from '../clickModel'
import { GROUND_TRUTH_DECK, GROUND_TRUTH_SEGMENTS, GROUND_TRUTH_TOTALS, GROUND_TRUTH_UNCOUNTABLE } from './groundTruthDeck'

// The same deck and expectations the e2e test checks against real Slidev
// (tests/click-model-ground-truth.spec.ts).

const repoRoot = join(__dirname, '../../../..')

describe('click model against the ground-truth deck', () => {
  const slides = computeDocumentClicks(GROUND_TRUTH_DECK, {
    resolveImportText: path => readFileSync(join(repoRoot, path.replace(/^@\//, '')), 'utf-8'),
  })

  it('counts every slide as Slidev does, or declines to', () => {
    const expected = GROUND_TRUTH_TOTALS.map((total, index) => (GROUND_TRUTH_UNCOUNTABLE.includes(index + 1) ? null : total))
    expect(slides.map(s => s.total)).toEqual(expected)
  })

  it('places native fence range segments at Slidev\'s clicks', () => {
    const segments = slides.flatMap(slide => slide.registrations
      .filter(r => r.kind === 'fence-range')
      .flatMap(r => r.segments!
        .filter(s => s.line !== r.line)
        .map(s => [slide.slide.no, s.line - r.line, s.click] as [number, number, number | null])))
    expect(segments).toEqual(GROUND_TRUTH_SEGMENTS)
  })
})
