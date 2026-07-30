import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { findMarkdownFiles, readThemeTaggedMarkdownFiles, makeResolveImportPath, findProjectRoot } from '../scanner'

let dir: string

afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true })
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
    const resolve = makeResolveImportPath(root, 'code', (m) => warnings.push(m))
    expect(resolve('slides.md', '@/../outside.java')).toBeNull()
    expect(warnings).toHaveLength(1)
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
