import { describe, expect, it } from 'vitest'
import { usesCodeurjcSlidevTheme } from '../themeGate'

describe('usesCodeurjcSlidevTheme', () => {
  it('returns true for a document with matching theme frontmatter', () => {
    const text = ['---', 'theme: codeurjc-slidev-theme', 'title: Demo', '---', '', '# Slide'].join('\n')
    expect(usesCodeurjcSlidevTheme(text)).toBe(true)
  })

  it('returns false when there is no frontmatter at all', () => {
    expect(usesCodeurjcSlidevTheme('# Just a heading\n\nSome text.')).toBe(false)
  })

  it('returns false when frontmatter has no theme field', () => {
    const text = ['---', 'title: Demo', '---', '', '# Slide'].join('\n')
    expect(usesCodeurjcSlidevTheme(text)).toBe(false)
  })

  it('returns false for a different theme', () => {
    const text = ['---', 'theme: seriph', '---', ''].join('\n')
    expect(usesCodeurjcSlidevTheme(text)).toBe(false)
  })

  it('handles a leading BOM before the frontmatter delimiter', () => {
    // eslint-disable-next-line no-irregular-whitespace -- intentional leading BOM under test
    const text = `﻿${['---', 'theme: codeurjc-slidev-theme', '---', ''].join('\n')}`
    expect(usesCodeurjcSlidevTheme(text)).toBe(true)
  })

  it('handles a quoted theme value', () => {
    const text = ['---', 'theme: "codeurjc-slidev-theme"', '---', ''].join('\n')
    expect(usesCodeurjcSlidevTheme(text)).toBe(true)
  })
})
