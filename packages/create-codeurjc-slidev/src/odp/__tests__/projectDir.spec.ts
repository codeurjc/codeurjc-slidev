import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { isRecognizedProject } from '../../../project-dir.mjs'

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'project-dir-'))
})

afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('isRecognizedProject', () => {
  it('is true when package.json depends on the theme', () => {
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ dependencies: { 'codeurjc-slidev-theme': '^0.2.0', 'vue': '^3' } }))
    expect(isRecognizedProject(dir)).toBe(true)
  })

  it('is false when package.json has other dependencies only', () => {
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ dependencies: { vue: '^3' } }))
    expect(isRecognizedProject(dir)).toBe(false)
  })

  it('is false when the theme is only a devDependency', () => {
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ devDependencies: { 'codeurjc-slidev-theme': '^0.2.0' } }))
    expect(isRecognizedProject(dir)).toBe(false)
  })

  it('is false without a package.json, or for a directory that does not exist', () => {
    expect(isRecognizedProject(dir)).toBe(false)
    expect(isRecognizedProject(join(dir, 'missing'))).toBe(false)
  })

  it('is false for a package.json that is not valid JSON', () => {
    writeFileSync(join(dir, 'package.json'), '{ not json')
    expect(isRecognizedProject(dir)).toBe(false)
  })

  it('is false for a directory holding only import-reports/', () => {
    mkdirSync(join(dir, 'import-reports'))
    expect(isRecognizedProject(dir)).toBe(false)
  })
})
