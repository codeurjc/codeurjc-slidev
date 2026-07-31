import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { findMarkdownFiles, findProjectRoot, listCodeRootDirectory, makeResolveImportPath, readThemeTaggedMarkdownFiles, resolveImportAbsPath, resolveImportTarget } from '../scanner'

let dir: string

afterEach(() => {
  if (dir)
    rmSync(dir, { recursive: true, force: true })
})

function makeFixture(): string {
  dir = mkdtempSync(join(tmpdir(), 'vscode-codeurjc-slidev-'))
  mkdirSync(join(dir, 'code'), { recursive: true })
  mkdirSync(join(dir, 'node_modules', 'ignored'), { recursive: true })
  writeFileSync(join(dir, 'slides.md'), ['---', 'theme: codeurjc-slidev-theme', '---', ''].join('\n'))
  writeFileSync(join(dir, 'README.md'), '# just docs')
  writeFileSync(join(dir, 'node_modules', 'ignored', 'skip.md'), ['---', 'theme: codeurjc-slidev-theme', '---'].join('\n'))
  writeFileSync(join(dir, 'code', 'Foo.java'), 'public class Foo {}')
  writeFileSync(join(dir, 'package.json'), '{}')
  return dir
}

describe('findMarkdownFiles', () => {
  it('finds .md files while skipping node_modules', () => {
    const root = makeFixture()
    const found = findMarkdownFiles(root).map(p => p.replace(root, ''))
    expect(found.sort()).toEqual(['/README.md', '/slides.md'])
  })
})

describe('readThemeTaggedMarkdownFiles', () => {
  it('only includes files whose frontmatter declares the theme', () => {
    const root = makeFixture()
    const files = readThemeTaggedMarkdownFiles(root)
    const keys = Object.keys(files).map(p => p.replace(root, ''))
    expect(keys).toEqual(['/slides.md'])
  })
})

describe('makeResolveImportPath', () => {
  it('resolves an @/ import path under the code root', () => {
    const root = makeFixture()
    const resolve = makeResolveImportPath(root)
    expect(resolve('slides.md', '@/code/Foo.java')).toBe(`${root}/code/Foo.java`)
  })

  it('warns and returns null for a path escaping the code root', () => {
    const root = makeFixture()
    const warnings: string[] = []
    const resolve = makeResolveImportPath(root, 'code', m => warnings.push(m))
    expect(resolve('slides.md', '@/../outside.java')).toBeNull()
    expect(warnings).toHaveLength(1)
  })
})

describe('resolveImportAbsPath', () => {
  it('resolves an @/ path against the project root', () => {
    const root = makeFixture()
    expect(resolveImportAbsPath('@/code/Foo.java', join(root, 'slides.md'), root)).toBe(`${root}/code/Foo.java`)
  })

  it('resolves a plain relative path against the importing markdown file\'s own directory', () => {
    const root = makeFixture()
    mkdirSync(join(root, 'slides'), { recursive: true })
    writeFileSync(join(root, 'slides', 'Foo.java'), 'public class Foo {}')
    expect(resolveImportAbsPath('./Foo.java', join(root, 'slides', 'deck.md'), root)).toBe(`${root}/slides/Foo.java`)
  })
})

describe('resolveImportTarget', () => {
  it('reports escapesCodeRoot: false for a path under the code root', () => {
    const root = makeFixture()
    expect(resolveImportTarget('@/code/Foo.java', join(root, 'slides.md'), root)).toEqual({
      absPath: `${root}/code/Foo.java`,
      escapesCodeRoot: false,
    })
  })

  it('reports escapesCodeRoot: true for a path outside the code root', () => {
    const root = makeFixture()
    expect(resolveImportTarget('@/../outside.java', join(root, 'slides.md'), root)).toEqual({
      absPath: `${dirname(root)}/outside.java`,
      escapesCodeRoot: true,
    })
  })
})

describe('listCodeRootDirectory', () => {
  it('lists top-level code-root entries, skipping ignored directories', () => {
    const root = makeFixture()
    mkdirSync(join(root, 'code', 'ejer8'), { recursive: true })
    mkdirSync(join(root, 'code', 'node_modules'), { recursive: true })
    const entries = listCodeRootDirectory(root, '')
    expect(entries.sort((a, b) => a.name.localeCompare(b.name))).toEqual([
      { name: 'ejer8', isDirectory: true },
      { name: 'Foo.java', isDirectory: false },
    ])
  })

  it('lists entries of a nested directory', () => {
    const root = makeFixture()
    mkdirSync(join(root, 'code', 'ejer8'), { recursive: true })
    writeFileSync(join(root, 'code', 'ejer8', 'Bar.java'), 'public class Bar {}')
    expect(listCodeRootDirectory(root, 'ejer8')).toEqual([{ name: 'Bar.java', isDirectory: false }])
  })

  it('returns an empty list for a non-existent directory', () => {
    const root = makeFixture()
    expect(listCodeRootDirectory(root, 'does-not-exist')).toEqual([])
  })
})

describe('findProjectRoot', () => {
  it('finds the ancestor directory containing the code root', () => {
    const root = makeFixture()
    mkdirSync(join(root, 'nested'), { recursive: true })
    const mdPath = join(root, 'nested', 'slides.md')
    writeFileSync(mdPath, '---\ntheme: codeurjc-slidev-theme\n---')
    expect(findProjectRoot(mdPath)).toBe(root)
  })
})
