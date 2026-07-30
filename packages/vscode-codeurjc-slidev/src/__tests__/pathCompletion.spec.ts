import { describe, it, expect } from 'vitest'
import { computeImportPathContext, filterPathEntries } from '../pathCompletion'

describe('computeImportPathContext', () => {
  it('returns the code root context right after "<<< @/"', () => {
    expect(computeImportPathContext('<<< @/')).toEqual({ dirRelPath: '', segmentPrefix: '' })
  })

  it('returns a segment prefix for a partial top-level name', () => {
    expect(computeImportPathContext('<<< @/eje')).toEqual({ dirRelPath: '', segmentPrefix: 'eje' })
  })

  it('returns a subdirectory context after a completed segment', () => {
    expect(computeImportPathContext('<<< @/ejer8/')).toEqual({ dirRelPath: 'ejer8', segmentPrefix: '' })
  })

  it('returns a nested segment prefix', () => {
    expect(computeImportPathContext('<<< @/ejer8/src/Foo')).toEqual({ dirRelPath: 'ejer8/src', segmentPrefix: 'Foo' })
  })

  it('returns null once a selector bracket has started', () => {
    expect(computeImportPathContext('<<< @/code/Foo.java[7-')).toBeNull()
  })

  it('returns null once whitespace (the language token) has started', () => {
    expect(computeImportPathContext('<<< @/code/Foo.java ')).toBeNull()
  })

  it('returns null for a non-import line', () => {
    expect(computeImportPathContext('just some text')).toBeNull()
  })

  it('returns null for a relative (non @/) import path', () => {
    expect(computeImportPathContext('<<< ./Foo.java')).toBeNull()
  })
})

describe('filterPathEntries', () => {
  const entries = [
    { name: 'ejer7', isDirectory: true },
    { name: 'ejer8', isDirectory: true },
    { name: 'Foo.java', isDirectory: false },
  ]

  it('returns all entries for an empty prefix', () => {
    expect(filterPathEntries(entries, '')).toEqual(entries)
  })

  it('filters by a matching prefix', () => {
    expect(filterPathEntries(entries, 'ejer8')).toEqual([{ name: 'ejer8', isDirectory: true }])
  })

  it('returns nothing for a non-matching prefix', () => {
    expect(filterPathEntries(entries, 'zzz')).toEqual([])
  })

  it('is case-sensitive', () => {
    expect(filterPathEntries(entries, 'foo')).toEqual([])
  })
})
