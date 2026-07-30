import { describe, it, expect } from 'vitest'
import { buildReferenceIndex, updateReferenceIndexForFile } from '../indexBuilder'

const resolvePath = (mdPath: string, importFilePath: string) => `/repo/${importFilePath.replace(/^@\//, '')}`

describe('buildReferenceIndex', () => {
  it('indexes a single reference', () => {
    const files = {
      'slides.md': ['<<< @/code/Foo.java java', '[!mark:"a"] one'].join('\n'),
    }
    const index = buildReferenceIndex(files, resolvePath)
    expect(index.get('/repo/code/Foo.java')).toEqual([
      { slideFile: 'slides.md', slideLine: 1, selector: null, anchorLineText: '[!mark:"a"] one' },
    ])
  })

  it('aggregates references to the same target from multiple markdown files', () => {
    const files = {
      'a.md': ['<<< @/code/Foo.java java', '[!mark:"a"] one'].join('\n'),
      'b.md': ['<<< @/code/Foo.java java', '[!mark:"b"] two'].join('\n'),
    }
    const index = buildReferenceIndex(files, resolvePath)
    const recipes = index.get('/repo/code/Foo.java')!
    expect(recipes).toHaveLength(2)
    expect(recipes.map(r => r.slideFile).sort()).toEqual(['a.md', 'b.md'])
  })

  it('skips a malformed selector without throwing', () => {
    const files = { 'slides.md': '<<< @/code/Foo.java[bad] java' }
    expect(buildReferenceIndex(files, resolvePath).size).toBe(0)
  })

  it('does not index source directives', () => {
    const files = { 'slides.md': ['<<< @/code/Foo.java java', '[!source]'].join('\n') }
    expect(buildReferenceIndex(files, resolvePath).size).toBe(0)
  })

  it('skips an import whose target path cannot be resolved', () => {
    const files = { 'slides.md': ['<<< @/code/Foo.java java', '[!mark:"a"] one'].join('\n') }
    expect(buildReferenceIndex(files, () => null).size).toBe(0)
  })
})

describe('updateReferenceIndexForFile', () => {
  it('replaces stale entries for the changed file rather than appending', () => {
    const files = { 'slides.md': ['<<< @/code/Foo.java java', '[!mark:"a"] old comment'].join('\n') }
    const index = buildReferenceIndex(files, resolvePath)

    const updatedText = ['<<< @/code/Foo.java java', '[!mark:"a"] new comment'].join('\n')
    updateReferenceIndexForFile(index, 'slides.md', updatedText, resolvePath)

    const recipes = index.get('/repo/code/Foo.java')!
    expect(recipes).toHaveLength(1)
    expect(recipes[0].anchorLineText).toBe('[!mark:"a"] new comment')
  })

  it('removes the target entry entirely if the file no longer references it', () => {
    const files = { 'slides.md': ['<<< @/code/Foo.java java', '[!mark:"a"] one'].join('\n') }
    const index = buildReferenceIndex(files, resolvePath)

    updateReferenceIndexForFile(index, 'slides.md', '# no imports here', resolvePath)

    expect(index.has('/repo/code/Foo.java')).toBe(false)
  })

  it('leaves other files contributions untouched', () => {
    const files = {
      'a.md': ['<<< @/code/Foo.java java', '[!mark:"a"] from a'].join('\n'),
      'b.md': ['<<< @/code/Foo.java java', '[!mark:"b"] from b'].join('\n'),
    }
    const index = buildReferenceIndex(files, resolvePath)

    updateReferenceIndexForFile(index, 'a.md', '# emptied', resolvePath)

    const recipes = index.get('/repo/code/Foo.java')!
    expect(recipes).toEqual([{ slideFile: 'b.md', slideLine: 1, selector: null, anchorLineText: '[!mark:"b"] from b' }])
  })
})
