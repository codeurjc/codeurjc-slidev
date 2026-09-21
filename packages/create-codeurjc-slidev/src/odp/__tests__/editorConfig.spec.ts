import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ensureExtensionRecommendations, RECOMMENDED_EXTENSIONS } from '../../../editor-config.mjs'

let dir: string
const file = () => join(dir, '.vscode', 'extensions.json')
function write(text: string) {
  mkdirSync(join(dir, '.vscode'), { recursive: true })
  writeFileSync(file(), text)
}
const read = () => JSON.parse(readFileSync(file(), 'utf-8'))

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'editor-config-'))
})

afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('ensureExtensionRecommendations', () => {
  it('creates the file, and the .vscode directory, with both extensions', () => {
    expect(ensureExtensionRecommendations(dir).status).toBe('created')
    expect(read()).toEqual({ recommendations: ['codeurjc.vscode-codeurjc-slidev', 'antfu.slidev'] })
    expect(RECOMMENDED_EXTENSIONS).toEqual(read().recommendations)
  })

  it('adds only what is missing and keeps other recommendations and keys', () => {
    write(JSON.stringify({ recommendations: ['dbaeumer.vscode-eslint', 'antfu.slidev'], unwantedRecommendations: ['x.y'] }))
    const result = ensureExtensionRecommendations(dir)
    expect(result).toMatchObject({ status: 'updated', missing: ['codeurjc.vscode-codeurjc-slidev'] })
    expect(read()).toEqual({
      recommendations: ['dbaeumer.vscode-eslint', 'antfu.slidev', 'codeurjc.vscode-codeurjc-slidev'],
      unwantedRecommendations: ['x.y'],
    })
  })

  it('adds a recommendations list when the file has none', () => {
    write('{}')
    expect(ensureExtensionRecommendations(dir).status).toBe('updated')
    expect(read().recommendations).toEqual(RECOMMENDED_EXTENSIONS)
  })

  it('leaves a file that already has both untouched, even with comments', () => {
    const text = '{\n  // team picks\n  "recommendations": ["antfu.slidev", "codeurjc.vscode-codeurjc-slidev",],\n}\n'
    write(text)
    expect(ensureExtensionRecommendations(dir).status).toBe('unchanged')
    expect(readFileSync(file(), 'utf-8')).toBe(text)
  })

  it('does not rewrite a commented file that needs changes', () => {
    const text = '{\n  /* team picks */\n  "recommendations": ["dbaeumer.vscode-eslint"]\n}\n'
    write(text)
    const result = ensureExtensionRecommendations(dir)
    expect(result).toMatchObject({ status: 'skipped', missing: RECOMMENDED_EXTENSIONS })
    expect(readFileSync(file(), 'utf-8')).toBe(text)
  })

  it('does not treat // inside a string as a comment', () => {
    write('{"recommendations": ["a.b"], "note": "see http://example.com"}')
    expect(ensureExtensionRecommendations(dir).status).toBe('updated')
    expect(read().note).toBe('see http://example.com')
  })

  it('leaves an unparseable file, or one of the wrong shape, alone', () => {
    for (const text of ['{ not json', '[]', '{"recommendations": "antfu.slidev"}']) {
      write(text)
      const result = ensureExtensionRecommendations(dir)
      expect(result.status).toBe('skipped')
      expect(readFileSync(file(), 'utf-8')).toBe(text)
    }
  })
})
